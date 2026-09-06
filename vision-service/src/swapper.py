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

from face_enhancer import FaceEnhancer

MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models")
INSWAPPER_PATH = os.path.join(MODELS_DIR, "inswapper_128.onnx")

# Post-swap face enhancement (GFPGANv1.4). Removes the inswapper 128px
# pixelation. Can be disabled if fps needs to be maximized.
ENHANCE_FACE = True

# onnxruntime providers: CUDA first, CPU fallback
PROVIDERS = ["CUDAExecutionProvider", "CPUExecutionProvider"]


class FaceSwapper:
    """Owns the insightface app + inswapper model and the source face."""

    def __init__(self):
        self._lock = threading.Lock()
        self._app = None          # FaceAnalysis completa (source face: necesita embedding)
        self._app_detect = None   # Solo SCRFD (target por frame: bbox + kps, mucho mas rapido)
        self._swapper = None
        self._source_face = None
        self.ready = False
        self.error = None
        self._enhancer = None

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

        # Modelo SOLO de detección para el target por frame: el inswapper solo
        # necesita bbox + kps del target (el embedding lo da el source), así que
        # evitamos correr landmarks/genderage/recognition en CADA frame (era ~328ms).
        self._app_detect = FaceAnalysis(name="buffalo_l", allowed_modules=["detection"], providers=PROVIDERS)
        self._app_detect.prepare(ctx_id=0, det_size=(320, 320))

        self._swapper = insightface.model_zoo.get_model(INSWAPPER_PATH, providers=PROVIDERS)
        self.ready = True
        print("[FaceSwapper] models loaded (buffalo_l detect + inswapper_128)")

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
                # Solo SCRFD para el target (bbox + kps) — mucho más rápido
                from insightface.app.common import Face
                bboxes, kpss = self._app_detect.det_model.detect(frame_bgr)
                if bboxes.shape[0] == 0:
                    return frame_bgr  # no face → passthrough
                # largest face first
                areas = (bboxes[:, 2] - bboxes[:, 0]) * (bboxes[:, 3] - bboxes[:, 1])
                idx = int(np.argmax(areas))
                target = Face(
                    bbox=bboxes[idx, 0:4],
                    kps=(kpss[idx] if kpss is not None else None),
                    det_score=float(bboxes[idx, 4]),
                )
                if target.kps is None:
                    return frame_bgr

                # Paste-back NATIVO de inswapper: su máscara (img_white) se deriva
                # del contenido real del fake_face → NUNCA deja negro alrededor.
                # (Mi paste custom rellenaba negro fuera de la cara y ese negro
                # entraba al crop de GFPGAN → sombras negras en el rostro.)
                result = self._swapper.get(frame_bgr, target, self._source_face, paste_back=True)
                if result is None:
                    return frame_bgr

                # GFPGAN post-processing: kill the inswapper 128px pixelation
                if ENHANCE_FACE:
                    try:
                        if self._enhancer is None:
                            self._enhancer = FaceEnhancer()
                        result = self._enhancer.enhance(result, target)
                    except Exception as e:
                        print(f"[FaceSwapper] enhance error: {e}")

                return result
            except Exception as e:
                self.error = str(e)
                print(f"[FaceSwapper] swap error: {e}")
                return None
