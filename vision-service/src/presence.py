"""
Presence detection using InsightFace FaceAnalysis.

Provides a singleton-style detector that runs on each captured frame
and reports whether at least one face is visible.
"""

from insightface.app import FaceAnalysis
import cv2

class PresenceDetector:
    """Detects human presence (faces) in camera frames."""

    def __init__(self, model_name: str = "buffalo_l", det_size: tuple = (320, 320)):
        self._app = FaceAnalysis(name=model_name, root=".insightface")
        self._app.prepare(ctx_id=0, det_size=det_size)

    def detect(self, frame) -> bool:
        """Returns True if at least one face is detected in the frame."""
        if frame is None:
            return False
        faces = self._app.get(frame)
        return len(faces) > 0

    def get_face_count(self, frame) -> int:
        """Returns the number of faces detected in the frame."""
        if frame is None:
            return 0
        faces = self._app.get(frame)
        return len(faces)

    def get_faces(self, frame):
        """Returns the raw list of detected face objects."""
        if frame is None:
            return []
        return self._app.get(frame)
