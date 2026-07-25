"""
Gesture detection using full-frame motion analysis.

Detects a "wave" gesture by analyzing motion across the entire frame.
Uses contour detection on frame differences to find sustained,
localized motion.
"""

import cv2
import numpy as np
from collections import deque

# Minimum contour area (as fraction of total frame) to count as "motion"
MIN_CONTOUR_RATIO = 0.002


class WaveDetector:
    """Detects a waving gesture via full-frame contour-based motion analysis."""

    def __init__(
        self,
        min_wave_frames: int = 3,
        cooldown_frames: int = 90,
        history_size: int = 30,
        blur_size: int = 7,
        diff_threshold: int = 12,
    ):
        """
        Args:
            min_wave_frames: Consecutive frames with motion needed to trigger.
            cooldown_frames: Frames to wait before allowing another detection.
            history_size: Number of recent frames to keep for pattern analysis.
            blur_size: Gaussian blur kernel size for noise reduction.
            diff_threshold: Pixel difference threshold for motion detection.
        """
        self.min_wave_frames = min_wave_frames
        self.cooldown_frames = cooldown_frames
        self.history_size = history_size
        self.blur_size = blur_size
        self.diff_threshold = diff_threshold

        self._prev_gray = None
        self._motion_count = 0
        self._cooldown = 0
        self._total_frames = 0

    def reset(self):
        """Reset internal state (e.g., when person leaves frame)."""
        self._prev_gray = None
        self._motion_count = 0
        self._cooldown = 0
        self._total_frames = 0

    def detect(self, frame) -> bool:
        """
        Returns True if a wave gesture is detected anywhere in the frame.
        A wave is registered when a sufficiently large moving region persists
        for several consecutive frames.
        """
        if frame is None:
            return False

        h, w = frame.shape[:2]
        frame_area = h * w
        min_contour_area = int(frame_area * MIN_CONTOUR_RATIO)

        # Cooldown
        if self._cooldown > 0:
            self._cooldown -= 1
            return False

        # Grayscale + blur
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (self.blur_size, self.blur_size), 0)

        if self._prev_gray is None:
            self._prev_gray = gray
            return False

        # Frame differencing
        diff = cv2.absdiff(self._prev_gray, gray)
        _, thresh = cv2.threshold(diff, self.diff_threshold, 255, cv2.THRESH_BINARY)
        self._prev_gray = gray

        # Morphological cleanup
        kernel = np.ones((3, 3), np.uint8)
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)

        # Find contours of motion
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        # Check if there's a significant moving region anywhere in the frame
        motion_found = False
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area >= min_contour_area:
                motion_found = True
                break

        # Track consecutive motion frames
        if motion_found:
            self._motion_count += 1
        else:
            self._motion_count = 0

        # Trigger when sustained motion is detected
        if self._motion_count >= self.min_wave_frames:
            self._cooldown = self.cooldown_frames
            self._motion_count = 0
            return True

        return False
