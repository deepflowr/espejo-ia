import cv2
import asyncio
import websockets
import threading
import time
import json
import os
from collections import deque
from detector import MediaPipeDetector
from capture import capture_photo

# ─── Configuration ─────────────────────────────────────────────
CAMERA_ROTATION = None  # Raptor Vision sends native portrait (1440x2560)
STREAM_SCALE = 1.0    # full resolution (no downscale)
JPEG_QUALITY = 85     # higher quality for HD
CROP_TO_9_16 = False   # no crop needed when rotating from native landscape
CAMERA_INDEX = 1        # 0 = built-in, 1 = Raptor Vision 4K (1440x2560 portrait)


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
    # Request highest resolution
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1920)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 1080)
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    print(f"Camera opened: {w}x{h}")

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

    # Wait a moment for the first frame to be captured
    time.sleep(1)

    # Assuming port 3001 as defined in the architecture roadmap
    async with websockets.serve(handler, "0.0.0.0", 3001):
        print("Vision Service running on port 3001...")
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
