import cv2
import asyncio
import websockets
import threading
import time
import json
import os
import base64
from collections import deque
from detector import MediaPipeDetector
from capture import capture_photo
from swapper import FaceSwapper

# ─── cuDNN / CUDA DLL path (must run at startup, before onnxruntime) ──
# os.add_dll_directory alone is unreliable in long-running processes; prepend
# the onnxruntime capi dir to PATH too so every LoadLibrary can find cuDNN.
try:
    import onnxruntime as _ort
    _capi = os.path.join(os.path.dirname(os.path.abspath(_ort.__file__)), "capi")
    if os.path.isdir(_capi):
        os.add_dll_directory(_capi)
        if _capi not in os.environ.get("PATH", "").split(os.pathsep):
            os.environ["PATH"] = _capi + os.pathsep + os.environ.get("PATH", "")
        print(f"[vision_server] cuDNN capi listo: {_capi}")
except Exception as _e:
    print(f"[vision_server] cuDNN path setup warning: {_e}")

# ─── Configuration ─────────────────────────────────────────────
CAMERA_ROTATION = None  # Raptor Vision sends native 4K portrait (2160x3840)
STREAM_SCALE = 1.0    # full resolution (no downscale)
JPEG_QUALITY = 85     # higher quality for HD
CROP_TO_9_16 = False   # already native 9:16 portrait
CAMERA_INDEX = 1        # 0 = built-in, 1 = Raptor Vision 4K (2160x3840 portrait via MJPG)


# ─── Thread-safe event queue ───────────────────────────────────
class EventQueue:
    """Bridge between detection thread and async WebSocket handler."""

    def __init__(self):
        self._events = deque()
        self._lock = threading.Lock()

    def push(self, event: dict):
        with self._lock:
            self._events.append(event)

    def pop_all(self) -> list:
        with self._lock:
            items = list(self._events)
            self._events.clear()
            return items


# ─── Global state ──────────────────────────────────────────────
class FrameBuffer:
    def __init__(self):
        self.frame = None
        self.lock = threading.Lock()

    def update(self, frame):
        with self.lock:
            self.frame = frame

    def get_frame(self):
        with self.lock:
            return self.frame


video_buffer = FrameBuffer()
event_queue = EventQueue()

# Unified MediaPipe detector
detector = MediaPipeDetector()
_wave_notification = 0  # frames remaining to show wave overlay

# ─── Face swap (inswapper, integrated) ────────────────────────
swapper = FaceSwapper()
swap_active = False  # True while ESPEJO_ACTIVO runs


def capture_thread():
    """Captures frames as fast as possible — no blocking."""
    cap = cv2.VideoCapture(CAMERA_INDEX)
    if not cap.isOpened():
        alt = 0 if CAMERA_INDEX == 1 else 1
        print(f"Camera {CAMERA_INDEX} failed, trying {alt}...")
        cap = cv2.VideoCapture(alt)
    if not cap.isOpened():
        print("Error: Could not open any video device.")
        return
    # Force MJPG codec for 4K support, then set resolution
    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc('M', 'J', 'P', 'G'))
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 2160)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 3840)
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    print(f"Camera opened: {w}x{h} (4K portrait)")

    while True:
        ret, frame = cap.read()
        if not ret or frame is None:
            break

        if CAMERA_ROTATION is not None:
            frame = cv2.rotate(frame, CAMERA_ROTATION)
        # No backend flip — frontend handles mirror via canvas scale(-1,1)

        # Center-crop to 9:16 portrait (extract middle region)
        if CROP_TO_9_16:
            h, w = frame.shape[:2]
            target_w = int(h * 9 / 16)
            if target_w < w:
                x_start = (w - target_w) // 2
                frame = frame[:, x_start:x_start + target_w]
            else:
                # If frame is already tall enough, crop height instead
                target_h = int(w * 16 / 9)
                if target_h < h:
                    y_start = (h - target_h) // 2
                    frame = frame[y_start:y_start + target_h, :]

        video_buffer.update(frame)

    cap.release()


def detection_thread():
    """Runs at ~5 Hz: runs MediaPipe face detection + hand tracking."""
    global _wave_notification
    while True:
        frame = video_buffer.get_frame()
        if frame is not None:
            try:
                detector.detect(frame)
                present = detector.present

                event_queue.push({"type": "presence", "value": present})

                # Face tracking data for frontend (normalized coordinates)
                face_data = detector.primary_face_normalized
                if face_data:
                    event_queue.push({"type": "face_tracking", **face_data})

                if detector.wave_detected:
                    print("Gesture detected: wave 👋")
                    _wave_notification = 30  # show overlay for ~1s
                    event_queue.push({"type": "gesture_detected", "gesture": "wave"})

            except Exception as e:
                print(f"Detection error: {e}")

        time.sleep(0.2)


def swap_thread():
    """Runs while swap is active: swaps the latest frame and pushes swap_frame events."""
    global swap_active
    while True:
        if not swap_active or not swapper.has_source():
            time.sleep(0.05)
            continue

        frame = video_buffer.get_frame()
        if frame is None:
            time.sleep(0.02)
            continue

        t0 = time.time()
        # Downscale before swap (4K is wasteful for inswapper) → max dim ~960
        h, w = frame.shape[:2]
        scale = min(1.0, 960 / max(h, w))
        if scale < 1.0:
            frame = cv2.resize(frame, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_LINEAR)

        swapped = swapper.swap(frame)
        if swapped is None:
            time.sleep(0.02)
            continue

        ok, buf = cv2.imencode('.jpg', swapped, [cv2.IMWRITE_JPEG_QUALITY, 85])
        if ok:
            event_queue.push({"type": "swap_frame", "image_b64": base64.b64encode(buf).decode('utf-8')})

        # Cap at ~20 fps
        elapsed = time.time() - t0
        if elapsed < 0.05:
            time.sleep(0.05 - elapsed)
        else:
            time.sleep(0.01)


def start_swap_background(image_b64: str):
    """Load models + set the source face (generated portrait) in a background
    thread so the async event loop / WebSocket connection never blocks.
    On success flips swap_active so swap_thread starts producing frames."""
    global swap_active
    try:
        ok = swapper.set_source(image_b64)
        if ok:
            swap_active = True
            print("[swap] source face set — swap ACTIVE")
            event_queue.push({"type": "swap_status", "active": True, "ready": swapper.ready})
        else:
            swap_active = False
            print("[swap] set_source returned False — swap NOT started")
            event_queue.push({"type": "swap_status", "active": False, "ready": swapper.ready, "error": "no source face"})
    except Exception as e:
        swap_active = False
        print(f"[swap] start_swap_background error: {e}")
        event_queue.push({"type": "swap_status", "active": False, "ready": swapper.ready, "error": str(e)})


async def handler(websocket):
    """
    WebSocket handler: streams binary frames + JSON events to clients,
    and listens for incoming commands (e.g., capture_photo from orchestrator).
    Draws face boxes and hand landmarks on frames for visual feedback.
    """
    print("Client connected to Vision Service")

    def annotate_frame(frame):
        """Draw face boxes, hand landmarks, and wave status on the frame."""
        global _wave_notification
        h, w = frame.shape[:2]

        # Hand landmarks + connections — white by default, green when waving
        for hand in detector.hand_data:
            pts = hand['landmarks']
            is_waving = hand['waving']

            color = (0, 255, 0) if is_waving else (220, 220, 220)  # green when waving, white otherwise

            # Draw connections (finger segments)
            connections = [
                (0,1),(1,2),(2,3),(3,4),       # thumb
                (0,5),(5,6),(6,7),(7,8),       # index
                (0,9),(9,10),(10,11),(11,12),  # middle
                (0,13),(13,14),(14,15),(15,16),# ring
                (0,17),(17,18),(18,19),(19,20),# pinky
                (5,9),(9,13),(13,17)           # palm
            ]
            for i, j in connections:
                if i < len(pts) and j < len(pts):
                    pt1 = (int(pts[i][0]), int(pts[i][1]))
                    pt2 = (int(pts[j][0]), int(pts[j][1]))
                    cv2.line(frame, pt1, pt2, color, 2)

            # Draw landmark dots
            for (x, y) in pts:
                cv2.circle(frame, (int(x), int(y)), 5, color, -1)

        return frame

    async def send_loop():
        """Continuously send annotated frames + pending events."""
        try:
            while True:
                for event in event_queue.pop_all():
                    await websocket.send(json.dumps(event))

                frame = video_buffer.get_frame()
                if frame is not None:
                    raw = frame.copy()
                    # Annotate with face box + hand landmarks + wave overlay
                    raw = annotate_frame(raw)
                    if STREAM_SCALE < 1.0:
                        h, w = raw.shape[:2]
                        new_w = int(w * STREAM_SCALE)
                        new_h = int(h * STREAM_SCALE)
                        raw = cv2.resize(raw, (new_w, new_h), interpolation=cv2.INTER_LINEAR)

                    success, buffer = cv2.imencode('.jpg', raw, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
                    if success:
                        await websocket.send(buffer.tobytes())

                await asyncio.sleep(0.03)
        except websockets.exceptions.ConnectionClosed:
            pass

    async def recv_loop():
        """Listen for incoming commands from the orchestrator."""
        global swap_active
        try:
            async for raw in websocket:
                try:
                    data = json.loads(raw)
                    cmd = data.get("type", "")

                    if cmd == "capture_photo":
                        print("Command received: capture_photo")
                        crop_args = {}
                        if "crop_center_x" in data:
                            crop_args["crop_center_x"] = data["crop_center_x"]
                            crop_args["crop_center_y"] = data["crop_center_y"]
                            crop_args["crop_size"] = data["crop_size"]
                        result = capture_photo(video_buffer, **crop_args)
                        if result:
                            event_queue.push({
                                "type": "photo_ready",
                                "image_b64": result["image_b64"],
                                "width": result["width"],
                                "height": result["height"],
                                "filepath": result["filepath"],
                            })
                        else:
                            print("Error: capture_photo failed — no frame available")

                    elif cmd == "start_swap":
                        print("Command received: start_swap")
                        # Load models + set source in a background thread so the
                        # async event loop (and WebSocket connections) don't block
                        image_b64 = data.get("image_b64", "")
                        threading.Thread(target=start_swap_background, args=(image_b64,), daemon=True).start()

                    elif cmd == "stop_swap":
                        print("Command received: stop_swap")
                        swap_active = False
                        event_queue.push({"type": "swap_status", "active": False, "ready": swapper.ready})

                    else:
                        print(f"Unknown command: {cmd}")

                except json.JSONDecodeError:
                    pass  # Ignore non-JSON messages from clients (e.g., browser binary frames)
        except websockets.exceptions.ConnectionClosed:
            pass

    # Run both loops concurrently
    await asyncio.gather(send_loop(), recv_loop())

async def main():
    # Start the camera thread (high priority — never blocked)
    capture = threading.Thread(target=capture_thread, daemon=True)
    capture.start()

    # Start the detection thread (lower priority — runs at ~5 Hz)
    detection = threading.Thread(target=detection_thread, daemon=True)
    detection.start()

    # Start the face swap thread (idles until start_swap)
    swap = threading.Thread(target=swap_thread, daemon=True)
    swap.start()

    # Wait a moment for the first frame to be captured
    time.sleep(1)

    # Assuming port 3001 as defined in the architecture roadmap
    # max_size alto: start_swap manda el portrait completo en base64 (varios MB).
    # El default de websockets (1MB) tira PayloadTooBig y corta la conexión.
    async with websockets.serve(handler, "0.0.0.0", 3001, max_size=100 * 1024 * 1024):
        print("Vision Service running on port 3001...")
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
