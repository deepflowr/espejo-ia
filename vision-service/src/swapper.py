"""
Face swap module for El Espejo.

Clean-start implementation — inswapper_128 integrated into the Vision Service.
- Face detection / embedding: insightface FaceAnalysis (buffalo_l)
- Swap: inswapper_128 via onnxruntime on GPU
- No GFPGAN yet (can be added later if quality needs it)

The Vision Service owns the camera, so the swap happens here (same process),
avoiding a second process competing for the webcam on Windows.
"""

import base64
import os
import threading

import cv2
import numpy as np

MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models")
INSWAPPER_PATH = os.path.join(MODELS_DIR, "inswapper_128.onnx")

# onnxruntime providers: CUDA first, CPU fallback
PROVIDERS = ["CUDAExecutionProvider", "CPUExecutionProvider"]


class FaceSwapper:
    """Owns the insightface app + inswapper model and the source face."""

    def __init__(self):
        self._lock = threading.Lock()
        self._app = None
        self._swapper = None
        self._source_face = None
        self.ready = False
        self.error = None

    # ─── Model loading (lazy, first use) ──────────────────────
    def _ensure_models(self):
        if self._app is not None:
            return
        import onnxruntime as _ort

        # Windows: make onnxruntime find cuDNN (its capi dir isn't in the DLL
        # search path by default, so onnxruntime-gpu would fail to load cudnn64_9.dll)
        try:
            _capi = os.path.join(os.path.dirname(os.path.abspath(_ort.__file__)), "capi")
            os.add_dll_directory(_capi)
            if _capi not in os.environ.get("PATH", "").split(os.pathsep):
                os.environ["PATH"] = _capi + os.pathsep + os.environ.get("PATH", "")
        except Exception as e:
            print(f"[FaceSwapper] add_dll_directory warning: {e}")

        from insightface.app import FaceAnalysis
        import insightface

        self._app = FaceAnalysis(name="buffalo_l", providers=PROVIDERS)
        # det_size 320: SCRFD falla con tamaños grandes en este setup
        # (640/960/1280 dan score ~0.05; 320 detecta confiable ~0.86)
        self._app.prepare(ctx_id=0, det_size=(320, 320))
        self._swapper = insightface.model_zoo.get_model(INSWAPPER_PATH, providers=PROVIDERS)
        self.ready = True
        print("[FaceSwapper] models loaded (buffalo_l + inswapper_128)")

    # ─── Source face (the generated portrait) ─────────────────
    def set_source(self, image_b64: str) -> bool:
        """Set the source face from a base64 image (the generated portrait)."""
        try:
            raw = image_b64.split(",")[-1]
            arr = np.frombuffer(base64.b64decode(raw), np.uint8)
            img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if img is None:
                print("[FaceSwapper] set_source: could not decode image")
                return False
            with self._lock:
                self._ensure_models()
                faces = self._app.get(img)
                if not faces:
                    self._source_face = None
                    print("[FaceSwapper] set_source: no face found in portrait")
                    return False
                # Largest face = the portrait subject
                faces.sort(key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]), reverse=True)
                self._source_face = faces[0]
                print(f"[FaceSwapper] source face set ({len(faces)} face(s) in portrait)")
                return True
        except Exception as e:
            self.error = str(e)
            print(f"[FaceSwapper] set_source error: {e}")
            return False

    def has_source(self) -> bool:
        return self._source_face is not None

    # ─── Swap one frame ───────────────────────────────────────
    def swap(self, frame_bgr):
        """
        Swap the largest target face in frame_bgr with the source face.
        Returns the swapped frame. If no target face: returns the frame unchanged.
        """
        if not self.has_source():
            return None
        with self._lock:
            try:
                faces = self._app.get(frame_bgr)
                if not faces:
                    return frame_bgr  # no face → passthrough
                faces.sort(key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]), reverse=True)
                target = faces[0]
                return self._swapper.get(frame_bgr, target, self._source_face, paste_back=True)
            except Exception as e:
                self.error = str(e)
                print(f"[FaceSwapper] swap error: {e}")
                return None
