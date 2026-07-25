"""
Photo capture module for El Espejo.

Captures the current frame from the video buffer at full resolution,
saves it as a JPEG file, and returns base64 for WebSocket transmission.
"""

import cv2
import os
import base64
import time
from datetime import datetime


# Directory where captured reference photos are saved
CAPTURES_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "captures")


def _ensure_dir():
    os.makedirs(CAPTURES_DIR, exist_ok=True)


def capture_photo(frame_buffer, filename: str = None, crop_center_x: float = None, crop_center_y: float = None, crop_size: float = None) -> dict:
    """
    Capture a photo from the shared frame buffer at full resolution.

    Args:
        frame_buffer: FrameBuffer instance with the latest camera frame.
        filename: Optional custom filename. Auto-generated if None.
        crop_center_x: Optional normalized X center of crop square (0-1).
        crop_center_y: Optional normalized Y center of crop square (0-1).
        crop_size: Optional size of crop square in pixels (will be clamped to frame).

    Returns:
        dict with:
            - 'filepath': absolute path to the saved JPEG file
            - 'image_b64': base64-encoded JPEG string
            - 'width': image width in pixels
            - 'height': image height in pixels
        or None if no frame is available.
    """
    frame = frame_buffer.get_frame()
    if frame is None:
        return None

    h, w = frame.shape[:2]

    # Square crop around face if coordinates provided
    # crop_center_x/y are normalized 0-1, crop_size is fraction of frame width
    if crop_center_x is not None and crop_center_y is not None and crop_size is not None:
        cx = int(crop_center_x * w)
        cy = int(crop_center_y * h)
        half = int(crop_size * w / 2)
        x1 = max(0, cx - half)
        y1 = max(0, cy - half)
        x2 = min(w, cx + half)
        y2 = min(h, cy + half)
        # Ensure square by taking the smaller dimension
        side = min(x2 - x1, y2 - y1)
        if side > 0:
            frame = frame[y1:y1 + side, x1:x1 + side]

    # Encode to PNG (lossless, maximum quality for the reference photo)
    success, buffer = cv2.imencode('.png', frame)
    if not success:
        return None

    # Base64 for transmission
    image_b64 = base64.b64encode(buffer).decode('utf-8')

    # Save to disk
    _ensure_dir()
    if filename is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        filename = f"capture_{timestamp}.png"

    filepath = os.path.join(CAPTURES_DIR, filename)
    with open(filepath, 'wb') as f:
        f.write(buffer.tobytes())

    print(f"Photo saved: {filepath} ({w}x{h}, {len(buffer)} bytes)")

    return {
        'filepath': filepath,
        'image_b64': image_b64,
        'width': w,
        'height': h,
    }
