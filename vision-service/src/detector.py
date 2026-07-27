"""
Detector using MediaPipe for face detection (presence) and
hand tracking (wave gesture) with visual debugging data.
"""

import os
os.environ["MPLBACKEND"] = "Agg"

import cv2
import numpy as np
from collections import deque
import mediapipe as mp
from mediapipe.tasks.python import vision
from mediapipe.tasks.python.core.base_options import BaseOptions

PRESENCE_MIN_FRAMES = 3     # frames needed to confirm presence
ABSENCE_MIN_FRAMES = 30     # ~6 seconds before declaring absent (at 5Hz)
# Face must be at least this fraction of frame width to count as "present" (distance filter)
MIN_FACE_WIDTH_RATIO = 0.06
WAVE_HISTORY_SIZE = 6
WAVE_MIN_AMPLITUDE = 0.04   # minimum movement amplitude
WAVE_MIN_ZERO_CROSSINGS = 2  # direction changes needed (1 full cycle = ~400ms at 5Hz)
WAVE_COOLDOWN_FRAMES = 15   # ~3 seconds at 5Hz (longer cooldown since detection is faster)


class MediaPipeDetector:
    """Face presence + hand wave detection via MediaPipe."""

    def __init__(self):
        models_dir = os.path.join(os.path.dirname(__file__), "..", "models")
        self._face = vision.FaceDetector.create_from_options(
            vision.FaceDetectorOptions(
                base_options=BaseOptions(
                    model_asset_path=os.path.join(models_dir, "blaze_face_short_range.tflite")
                ),
                running_mode=vision.RunningMode.IMAGE,
                min_detection_confidence=0.5,
            )
        )
        self._hand = vision.HandLandmarker.create_from_options(
            vision.HandLandmarkerOptions(
                base_options=BaseOptions(
                    model_asset_path=os.path.join(models_dir, "hand_landmarker.task")
                ),
                running_mode=vision.RunningMode.IMAGE,
                num_hands=2,
                min_hand_detection_confidence=0.8,  # higher precision — fewer false positives
            )
        )

        self._presence_count = 0
        self._absence_count = 0
        self.present = False
        self._wrist_x: deque = deque(maxlen=WAVE_HISTORY_SIZE)
        self._wave_cooldown = 0
        self.wave_detected = False

        # ── Primary face (closest person) ──
        self._primary_face = None   # (x1, y1, x2, y2) pixel coords
        self._frame_w = 0
        self._frame_h = 0

        # ── Debug / visual data (thread-safe, read by handler) ──
        self.face_boxes = []       # list of (x1, y1, x2, y2) in pixel coords (primary only)
        self.hand_data = []        # list of { 'landmarks': [(x,y),...], 'open': bool, 'waving': bool }

    def detect(self, frame: np.ndarray):
        if frame is None:
            return
        self.wave_detected = False
        self.face_boxes = []
        self.hand_data = []
        self._primary_face = None

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        h, w = frame.shape[:2]
        self._frame_w = w
        self._frame_h = h

        # ── Face detection: pick the closest person as primary ──
        r = self._face.detect(mp_image)
        candidates = []
        for d in r.detections:
            bbox = d.bounding_box
            x1, y1 = bbox.origin_x, bbox.origin_y
            x2, y2 = x1 + bbox.width, y1 + bbox.height
            face_w = x2 - x1
            if face_w >= w * MIN_FACE_WIDTH_RATIO:
                candidates.append((x1, y1, x2, y2, face_w))

        # Closest face = largest bounding box width
        has_primary = False
        if candidates:
            candidates.sort(key=lambda c: c[4], reverse=True)
            x1, y1, x2, y2, _ = candidates[0]
            self._primary_face = (x1, y1, x2, y2)
            self.face_boxes.append((x1, y1, x2, y2))
            has_primary = True

        # Presence: use separate counters for detection and loss (hysteresis)
        if has_primary:
            self._presence_count = min(self._presence_count + 1, PRESENCE_MIN_FRAMES + 1)
            self._absence_count = 0
        else:
            self._absence_count = min(self._absence_count + 1, ABSENCE_MIN_FRAMES + 1)
            # Decay presence count so intermittent false positives don't keep presence alive
            self._presence_count = max(self._presence_count - 1, 0)
        self.present = self._presence_count >= PRESENCE_MIN_FRAMES and self._absence_count < ABSENCE_MIN_FRAMES

        if not self.present:
            self._wrist_x.clear()
            self._wave_cooldown = 0
            return

        if self._wave_cooldown > 0:
            self._wave_cooldown -= 1
            return

        # ── Hand tracking — only hands near the primary face ──
        hand_result = self._hand.detect(mp_image)
        for hand in hand_result.hand_landmarks:
            if not self._is_hand_near_face(hand):
                continue

            pts = [(lm.x * w, lm.y * h) for lm in hand]
            is_open = self._is_open_hand(hand)
            is_waving = False

            if is_open:
                self._wrist_x.append(hand[0].x)
                if self._detect_oscillation():
                    is_waving = True
                    self.wave_detected = True
                    self._wave_cooldown = WAVE_COOLDOWN_FRAMES
                    self._wrist_x.clear()

            self.hand_data.append({'landmarks': pts, 'open': is_open, 'waving': is_waving})

    @property
    def primary_face_normalized(self) -> dict | None:
        """Return the primary face as normalized coordinates (0-1) for frontend consumption."""
        if self._primary_face is None or self._frame_w == 0:
            return None
        x1, y1, x2, y2 = self._primary_face
        fw = x2 - x1
        fh = y2 - y1
        return {
            "x": (x1 + x2) / 2.0 / self._frame_w,
            "y": (y1 + y2) / 2.0 / self._frame_h,
            "width": fw / self._frame_w,
            "height": fh / self._frame_h,
            "present": self.present,
        }

    def reset(self):
        self._presence_count = 0
        self._absence_count = 0
        self.present = False
        self.wave_detected = False
        self._wrist_x.clear()
        self._wave_cooldown = 0
        self.face_boxes = []
        self.hand_data = []
        self._primary_face = None

    # ─── Internal helpers ──────────────────────────────────────

    def _is_open_hand(self, lm) -> bool:
        """Check if hand is open (at least 3 fingers extended, using x,y only)."""
        wrist = np.array([lm[0].x, lm[0].y])
        return sum(
            np.linalg.norm(np.array([lm[t].x, lm[t].y]) - wrist) > 0.05
            for t in [4, 8, 12, 16, 20]
        ) >= 3

    def _is_hand_near_face(self, hand) -> bool:
        """Check if the hand's wrist is within a generous region around the primary face."""
        if self._primary_face is None:
            return False
        fx1, fy1, fx2, fy2 = self._primary_face
        fw = fx2 - fx1
        fh = fy2 - fy1
        hx = hand[0].x * self._frame_w
        hy = hand[0].y * self._frame_h
        # Generous expansion: 2x face width sideways, 1x above, 3x below
        margin_x = fw * 2
        margin_top = fh * 1
        margin_bottom = fh * 3
        return (
            fx1 - margin_x <= hx <= fx2 + margin_x
            and fy1 - margin_top <= hy <= fy2 + margin_bottom
        )

    def _detect_oscillation(self) -> bool:
        """Detect left-right oscillation of the wrist (waving motion)."""
        if len(self._wrist_x) < WAVE_HISTORY_SIZE:
            return False
        diffs = np.diff(list(self._wrist_x))
        crossings = 0
        for i in range(1, len(diffs)):
            if diffs[i] * diffs[i - 1] < 0:
                if abs(self._wrist_x[i + 1] - self._wrist_x[i]) >= WAVE_MIN_AMPLITUDE:
                    crossings += 1
        return crossings >= WAVE_MIN_ZERO_CROSSINGS
