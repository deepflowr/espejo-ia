"""
Face enhancement (GFPGANv1.4) via onnxruntime-gpu for El Espejo.

Solves the inswapper_128 "pixelated face" problem: inswapper pastes a 128x128
face that gets upscaled to the face's size in the frame, leaving it soft/blocky.
GFPGAN restores the aligned face crop at 512x512 with real detail, then the
enhanced face is inverse-warped back and blended with a feathered mask.

No torch needed — runs on the existing onnxruntime-gpu.
"""

import os

import cv2
import numpy as np
import onnxruntime as ort

MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models")
GFPGAN_PATH = os.path.join(MODELS_DIR, "GFPGANv1.4.onnx")

PROVIDERS = ["CUDAExecutionProvider", "CPUExecutionProvider"]

# Standard GFPGAN alignment template (same order as insightface kps):
# [right eye, left eye, nose, right mouth corner, left mouth corner]
FACE_TEMPLATE = np.float32(
    [
        [192.98138, 239.94708],
        [318.90277, 240.1936],
        [256.63416, 314.01935],
        [201.26117, 371.41043],
        [313.08905, 371.15118],
    ]
)

def feathered_ellipse_mask(rh, rw, cx, cy, rx, ry, feather_sigma=2.0):
    """Máscara float32 [rh, rw, 1]: 1 dentro de la elipse, borde difuminado.

    El feather se computa a baja resolución (1/8) y se re-escala — hacer
    GaussianBlur con kernel grande sobre la región completa era ~70ms.
    """
    m = np.zeros((rh, rw), np.float32)
    cv2.ellipse(m, (int(cx), int(cy)), (int(rx), int(ry)), 0, 0, 360, 1.0, -1)
    sr = max(2, rh // 8)
    sc = max(2, rw // 8)
    small = cv2.resize(m, (sc, sr), interpolation=cv2.INTER_NEAREST)
    small = cv2.GaussianBlur(small, (0, 0), sigmaX=feather_sigma, sigmaY=feather_sigma)
    m = cv2.resize(small, (rw, rh), interpolation=cv2.INTER_LINEAR)
    return np.clip(m, 0.0, 1.0)[..., None]


class FaceEnhancer:
    """Runs GFPGANv1.4 on an aligned face crop and pastes it back feathered."""

    def __init__(self):
        self._sess = None
        self.ready = False
        self.error = None

    def _ensure(self):
        if self._sess is not None:
            return
        import onnxruntime as _ort

        # Same cuDNN PATH trick as vision_server.py / swapper.py
        try:
            _capi = os.path.join(os.path.dirname(os.path.abspath(_ort.__file__)), "capi")
            os.add_dll_directory(_capi)
            if _capi not in os.environ.get("PATH", "").split(os.pathsep):
                os.environ["PATH"] = _capi + os.pathsep + os.environ.get("PATH", "")
        except Exception as e:
            print(f"[FaceEnhancer] add_dll_directory warning: {e}")

        self._sess = ort.InferenceSession(GFPGAN_PATH, providers=PROVIDERS)
        self.ready = True
        print("[FaceEnhancer] GFPGANv1.4 cargado (onnx, GPU)")

    def enhance(self, frame_bgr, face):
        """Enhance the face region of frame_bgr. `face` is an insightface Face
        with .kps (5 landmarks). Returns the frame with the face enhanced."""
        try:
            self._ensure()
        except Exception as e:
            self.error = str(e)
            print(f"[FaceEnhancer] load error: {e}")
            return frame_bgr

        try:
            h, w = frame_bgr.shape[:2]
            kps = np.asarray(face.kps, dtype=np.float32).reshape(5, 2)

            # 1) Align the face to the 512x512 template (GFPGAN fixed input size)
            M, _ = cv2.estimateAffinePartial2D(kps, FACE_TEMPLATE, method=cv2.LMEDS)
            if M is None:
                return frame_bgr

            crop = cv2.warpAffine(
                frame_bgr, M, (512, 512), borderMode=cv2.BORDER_REFLECT
            )

            # 2) Run GFPGAN
            inp = crop[:, :, ::-1].astype(np.float32) / 255.0 * 2.0 - 1.0  # BGR→RGB [-1,1]
            inp = np.transpose(inp, (2, 0, 1))[None, ...]
            out = self._sess.run(None, {"input": inp})[0][0]  # [3, 512, 512]
            out = np.transpose(out, (1, 2, 0))
            out = (np.clip(out, -1.0, 1.0) + 1.0) / 2.0 * 255.0
            out = out[:, :, ::-1].astype(np.uint8)  # RGB→BGR

            # 3) Inverse warp back to the original frame.
            # BORDER_REFLECT espejaba la cara por todo el frame → halo espejado;
            # con borde negro la máscara elíptica oculta el resto.
            invM = cv2.invertAffineTransform(M)
            enhanced = cv2.warpAffine(out, invM, (w, h), borderMode=cv2.BORDER_CONSTANT, borderValue=0)

            # 4) Máscara de óvalo facial en el espacio ALINEADO (512), inverse-warp
            # con el MISMO IM → calza exacto con el contenido de GFPGAN y EXCLUYE
            # los corners oscuros del output del modelo (que causaban "sombras
            # negras que rotan" con la máscara por contenido).
            bbox = np.asarray(face.bbox, dtype=np.float32)
            bx, by, bx2, by2 = bbox
            face_w, face_h = bx2 - bx, by2 - by

            mask512 = np.zeros((512, 512), np.float32)
            cv2.ellipse(mask512, (256, 302), (168, 228), 0, 0, 360, 1.0, -1)
            mask512 = cv2.GaussianBlur(mask512, (0, 0), sigmaX=14)
            mask_frame = cv2.warpAffine(mask512, invM, (w, h), borderMode=cv2.BORDER_CONSTANT, borderValue=0)

            pad_x, pad_y = face_w * 0.20, face_h * 0.15
            x0 = max(0, int(bx - pad_x)); y0 = max(0, int(by - pad_y))
            x1 = min(w, int(bx2 + pad_x)); y1 = min(h, int(by2 + pad_y))
            rh, rw = y1 - y0, x1 - x0
            if rh <= 1 or rw <= 1:
                return frame_bgr

            result = frame_bgr.copy()
            region = frame_bgr[y0:y1, x0:x1].astype(np.float32)
            enh_reg = enhanced[y0:y1, x0:x1].astype(np.float32)
            m_reg = mask_frame[y0:y1, x0:x1, None]
            result[y0:y1, x0:x1] = (enh_reg * m_reg + region * (1.0 - m_reg)).astype(np.uint8)
            return result
        except Exception as e:
            self.error = str(e)
            print(f"[FaceEnhancer] enhance error: {e}")
            return frame_bgr
