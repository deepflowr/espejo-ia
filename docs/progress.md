# El Espejo — Progress Tracker

> Live document to track project state, decisions, and next steps for AI agents.

---

## Project Overview

**El Espejo** is an interactive AI mirror installation. A person stands in front of a camera, the system captures their portrait, generates a narrated AI reimagining via Ollama + ComfyUI, and shows a live face-swapped reflection.

---

## Current Project Structure

```
espejo/
├── docs/
│   ├── espejo-ux-flow.md              # UX flow & state diagram
│   ├── espejo-arquitectura-tecnica.md  # Architecture & protocol contracts
│   └── progress.md                     # ← THIS FILE
│
├── .venv/                              # Python venv (Python 3.13.14)
├── EspejoIA.json                       # ComfyUI API workflow (Z-Image Turbo + ControlNet + Lineart)
│
├── vision-service/
│   ├── requirements.txt
│   ├── models/
│   │   ├── blaze_face_short_range.tflite    # MediaPipe face detection
│   │   ├── face_detection_short_range.tflite# Face detection (alt model)
│   │   └── hand_landmarker.task             # MediaPipe hand tracking
│   └── src/
│       ├── vision_server.py            # WebSocket server + camera loop (port 3001)
│       ├── detector.py                 # MediaPipe face + hand detector (unified)
│       └── capture.py                  # Photo capture (high-res JPEG + base64)
│
├── orchestrator/                       # Node.js (initialized)
│   ├── package.json
│   └── src/
│       ├── index.js                    # Main server bootstrap
│       ├── stateMachine.js             # State machine (all UX flow transitions)
│       ├── session.js                  # Session management
│       ├── ws/
│       │   ├── uiServer.js             # WS server for frontend (port 3000)
│       │   └── visionClient.js         # WS client → vision service
│       └── services/
│           ├── ollama.js               # Streaming Ollama client
│           ├── comfyui.js              # Stub
│           └── mail.js                 # Stub
│
├── frontend/                           # Vite + Three.js + TypeScript
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── public/models/
│   │   ├── head.glb                    # 3D head model
│   │   ├── head2.glb                   # Source for face-part extraction
│   │   └── face-parts/                 # 13 extracted wireframe parts
│   │       ├── left-eye.glb, right-eye.glb, nose.glb, mouth.glb ...
│   └── src/
│       ├── main.ts                     # Entry: REPOSO scene with shader + 3D layers
│       ├── state-machine.ts            # Frontend-side state machine
│       ├── websocket-client.ts         # WS client → orchestrator (port 3000)
│       ├── data/word-bank.ts           # ~150 categorized words
│       ├── layers/
│       │   ├── idle-field.ts           # Full-screen Voronoi noise shader
│       │   ├── sphere-shader.ts        # Transparent Voronoi sphere (WIP)
│       │   ├── face-fragments.ts       # 50 floating 3D wireframe face parts
│       │   ├── face-assembly.ts        # Pairs converging from opposite sides (LECTURA)
│       │   ├── face-tracker.ts         # Face box with mock mode
│       │   ├── analysis-hud.ts         # Polaroid photo with full RGB ghost border + scanner (LECTURA)
│       │   ├── lectura-reveal.ts       # DOM white overlay opacity fade (CONGELADO→LECTURA)
│       │   ├── lectura-text.ts         # Typing messages below photo (removed from flow)
│       │   ├── lectura-thinking.ts     # Black box (slide-down, RGB ghosts, spinner, elapsed [Xs] timer)
│       │   ├── prompt-box.ts           # Black box with PROMPT_ES, quoted text, note, RGB ghosts
│       │   ├── text-fragments.ts       # 150 floating word sprites (5 depths)
│       │   └── debug-text.ts           # Debug overlay
│       ├── shaders/
│       │   ├── noise-field.frag        # Voronoi/fBm noise with palette + UI
│       │   └── noise-field.vert
│       └── tools/
│           └── extract-face-parts.cjs  # Extracted 15 face parts from head2.glb (added panda-eye masks)
│
└── index.html                          # Temp frontend (direct WS to vision service)
```

---

## What Works

| Component | Status | Notes |
|-----------|--------|-------|
| **Vision Service** (Python) | ✅ Running | WebSocket on port 3001, streams camera JPEG frames as binary |
| **Camera capture** | ✅ Working | OpenCV `cv2.VideoCapture(0)`, threading-safe `FrameBuffer` |
| **Mirror flip** | ✅ Done | IVCam already sends mirrored feed — no flip needed |
| **Vertical/portrait mode** | ✅ Ready | `CAMERA_ROTATION` config for sideways-mounted cameras |
| **Presence detection** | ✅ Working | MediaPipe `FaceDetector` in `detector.py`, distance-aware (min face width ratio) |
| **Gesture detection** | ✅ Working | MediaPipe `HandLandmarker` in `detector.py`, open-hand + wrist-oscillation wave detection |
| **Stream latency** | ✅ Optimized | Capture & detection in separate threads |
| **Visual overlays** | ✅ Removed from stream | Camera stream is raw (no annotation overlays) — visual UI handled by frontend |
| **Photo capture** | ✅ Working | `capture.py` saves high-res JPEG + returns base64 via WebSocket |
| **Structured WS events** | ✅ Working | JSON `presence`/`gesture_detected`/`photo_ready` events alongside binary frames |
| **Models** | ✅ Downloaded | MediaPipe models in `vision-service/models/` (face + hand) |
| **Orchestrator** (Node.js) | ✅ Initialized | `package.json`, index.js, stateMachine, session, services present |
| **Frontend — REPOSO state** | ✅ Working | Vite + Three.js + TypeScript. Full-screen Voronoi noise shader, 50 floating 3D wireframe face parts, 150+ word sprites, code-typing snippets, particles, constellation lines. Camera DOM overlay with radial reveal, oval face area. Typing dialog with auto-advance, mid-text pauses (`||`), wave trigger on last text. Encuadre phase with oval guide, face tracking oval with RGB ghosts, alignment detection, bright overlay with cutout, 3-2-1 countdown, flash + capture. |
| **Frontend — LECTURA state** | ✅ Working | DOM white opacity fade reveal, face-assembly wireframe pairs, polaroid photo with full RGB ghost border + scanner line, process-transparent thinking box (slide-down, RGB ghosts, spinner with elapsed [Xs] timer), structured description streaming, prompt box with PROMPT_ES text (quoted, Consolas, RGB ghosts). |
| **Ollama streaming** | ✅ Working | `ollama.js` streams `thinking_es` + `descripcion` + `prompt_en` + `prompt_es` channels. System prompt in Spanish. Model outputs structured description with `*` bullets. |
| **Photo capture (PNG)** | ✅ Working | `capture.py` saves lossless PNG at 1440×2560, base64 via WebSocket. JPEG quality removed in favor of PNG. |
| **ComfyUI bridge** | ✅ Working | `comfyui.js` sends photo + prompt to ComfyUI API, queues `EspejoIA.json` workflow, tracks progress via WS, fetches output. Mapeo de nodos actualizado. |
| **Pipeline end-to-end** | ✅ Working | Presencia → Diálogos → Wave → Encuadre → Captura → LECTURA (Ollama) → GENERACION (ComfyUI) → REVELACION. Flujo completo probado. |

### UI/UX Improvements (Latest Session)

1. **Unified RGB Ghost Borders** — All UI boxes (face bounding box, encuadre oval, photo HUD, dialog, thinking box, prompt box) now use the same border style: `1px` white border with 3 RGB ghosts using `position:absolute; inset:-1px` inside a `position:relative` container. Dynamic glitch animation (random offset every 0.06-0.16s with smooth recovery).
2. **Consolas Font Consistency** — Replaced all `bold` and mixed fonts with regular `Consolas, "Courier New", monospace`. Removed `Pixelify Sans` (countdown now uses `bold 320px Consolas`). Removed `Source Code Pro` from text-fragments. Deleted Google Fonts import from HTML.
3. **Prompt Box** — New module `prompt-box.ts`: black box with `> PROMPT (ES)` title, quoted text in Consolas 14px, separator, note about EN translation. Slides down after description closes.
4. **Dialog Box Restyle** — Dialog text now inside a black box (same border/ghost style) with fade-in/out transitions between dialogs. Last dialog stays visible with hint inside box. Full text appears at once (no typing). Auto-advance 4-12s based on text length.
5. **Thinking Box Restyle** — Replaced grow-from-bottom with slide-down animation matching prompt box. Elapsed timer `[Xs]` shown during generation. Status changed from `lista` to `Descripción finalizada correctamente`. Repositioned to match prompt box location.
6. **Status/Hint Text Restyle** — `statusEl` and `hintEl` re-styled to match prompt box title: italic, uppercase, letter-spacing, `>` prefix, Consolas.
7. **Encuadre Text Restyle** — Now uses same style: italic, uppercase, letter-spacing, white. Text: `> Colocá tu cara haciendo coincidir los óvalos` (single line).
8. **Waiting Text Spinner** — Added `| / - \` ASCII spinner animation to `#lectura-waiting` box.
9. **Waiting Text Flow Refined** — Text #2 now triggers when thinking box appears (not on chunk arrival). Demo fallback removed.
10. **Extracted Panda Eye Masks** — `left-eye-panda.glb` / `right-eye-panda.glb` (3611 tris each) with wider vertical coverage for blink animation.

### 2026-07-27 — Cámara 4K + fixes

- **Camera:** Raptor Vision ahora configurada a 2160×3840 (4K UHD portrait) vía MJPG + MSMF (sin DShow). CAMERA_INDEX=1.
- **RAM Cleanup desactivado** en `EspejoIA_image.json` (nodo 9). Modelos de Z-Image Turbo quedan en VRAM.
- **Traducción (prompt_es):** `max_tokens` de 256→1024 en `EspejoIA_Qwen text generation.json` (nodo 8). Ya no se corta.
- **Fix UI:** Mensaje "Saludá con la mano para continuar 👋" ahora aparece aunque `prompt_es` llegue antes que `descripcion` en el stream.

### 2026-08-12 — Sistema de revelación + consistencia del feed

**Workflow de imagen (`EspejoIA_image.json`):**
- Prefijos de SaveImage renombrados: nodo 10 = `Espejo_Final` (retrato completo), nodo 60 = `Espejo_Step` (pasos intermedios del denoise), nodo 56 = `Canny` (contornos).
- **RAM Cleanup desactivado en TODOS los nodos** (9 y 61) — Z-Image Turbo queda en VRAM entre corridas.

**Orquestador (`orchestrator/src/services/comfyui.js`):**
- Selección del retrato final por prefijo `Espejo_Final` + `type === 'output'`. Antes agarraba el `temp` del `PreviewImage` (paso intermedio) → la imagen se veía "sin terminar".
- Captura de previews de denoise: parseo de frames binarios `bpreview` de ComfyUI (formato `[uint32 len][uint32 len][json][json][png]`) + replay de `Espejo_Step` ordenados por filename. Se transmiten como `gen_preview`.
- `final_portrait` ahora es el retrato final real.

**Frontend — REVELACION (implementado de cero):**
- Etapa **transparente** (sin overlay negro): se ve el reflejo de la persona a opacidad 0.4.
- Título "> Generando tu reflejo..." + sub "> Paso X / N".
- Polaroid central grande (`78vw/600px`) que **recorre todos los pasos** del denoise (noise → final).
- El fondo **acumula polaroids** de cada paso (flotando junto a las del canny).
- Al final: **flash** cálido, todas las polaroids del fondo se convierten en la imagen final, y se muestran **dos polaroids apiladas**: "> TU CARA" (amarillo, foto original) y "> REFLEJO GENERADO" (verde, imagen generada) + "> Saludá para conocer a tu reflejo". Tamaño final 62vw/420px.

**UI / LECTURA:**
- Cajas de hint "Saludá para continuar 👋" debajo de la **descripción** y debajo del **prompt** (esta última solo aparece cuando el retrato está listo — nunca antes).
- Contadores y texto de estado ocultos al entrar a la revelación.
- Opacidad del feed de cámara **consistente**: 0.3 en toda LECTURA, 0.4 durante la revelación, fondo 0.3 en REPOSO/encuadre (antes fluctuaba 0.2/0.35/0.4).

**Notas técnicas:**
- `Error: extra_pnginfo[0] is not a dict or missing 'workflow' key` en ComfyUI es **inofensivo** (el PNG no lleva el workflow embebido; la generación no se afecta).
- El modelo Qwen del nodo `AILab_QwenVL_GGUF_PromptEnhancer` se recarga por corrida (ComfyUI crea instancia nueva por ejecución; el nodo no expone `keep_model_loaded`). **Aceptado, sin parche.**

### 2026-08-13 — Face swap end-to-end FUNCIONA (con parpadeo pendiente de pulir)

**Estado: el swap de cara ya funciona de punta a punta** (captura → generación → reveal → ESPEJO_ACTIVO → reflejo con cara intercambiada). Queda un problema de **parpadeo** sin resolver (ver abajo).

**Bug 1 — 431 en el navegador (base64 como URL)**
- `frontend/src/main.ts`: el `swap_frame` llegaba como base64 crudo y se asignaba directo a `img.src` → el navegador lo trataba como URL gigante → `431 Request Header Fields Too Large`.
- Fix: `swapImgEl.src = `data:image/jpeg;base64,${data.image_b64}`;`

**Bug 2 — Env no correcto (proceso viejo con el puerto 3001)**
- Había **dos vision services** compitiendo por el puerto 3001; el viejo (`.venv`/uv-python, sin swap funcional) se quedaba con el puerto y el orquestador le hablaba a él → cámara OK, swap nunca arrancaba, sin errores.
- `start.bat` arrancaba el vision service con `.venv` (CPU, numpy 2.x → insightface detecta 0 caras silenciosamente).
- Fix: `start.bat` ahora usa `.venv-swap` (GPU + swap). **Regla: el vision service SIEMPRE con `.venv-swap`, NUNCA `.venv`.**

**Bug 3 — `start_swap_background` no estaba definida**
- `vision_server.py` la usaba en `recv_loop` pero no existía → `NameError` → crasheaba el handler WS al recibir `start_swap`.
- Fix: función agregada — carga modelos + `set_source` en thread aparte, setea `swap_active` y emite `swap_status`.

**Bug 4 — `PayloadTooBig` cortaba la conexión al mandar el portrait**
- `websockets.serve` por defecto limita mensajes a **1 MB**. El `start_swap` manda el portrait completo en base64 (varios MB) → la librería cortaba la conexión justo al recibirlo (síntoma: `Disconnected from Vision Service` en el orquestador, sin `Command received: start_swap` en vision).
- Fix: `websockets.serve(..., max_size=100 * 1024 * 1024)`.

**Bug 5 — cuDNN no encontrado en proceso de larga duración**
- Error: `Could not locate cudnn_graph64_9.dll. Please make sure it is in your library path!` / `Invalid handle. Cannot load symbol cudnnCreate`.
- En proceso fresco (`python -c`) cargaba OK, pero el vision service (con OpenCV + MediaPipe ya cargados) fallaba → `os.add_dll_directory` solo no alcanza en procesos largos.
- Fix (doble): 
  1. Copiar DLLs de `C:\ComfyUI\ComfyUI-Easy-Install\python_embeded\Lib\site-packages\torch\lib\` (`cudnn*.dll`, `cublas*`, `cudart*`, etc.) a `.venv-swap\Lib\site-packages\onnxruntime\capi\`.
  2. Al arrancar `vision_server.py` (y en `swapper._ensure_models`): `os.add_dll_directory(capi)` **+ prepend de capi a `os.environ["PATH"]`**.
- Validado: `[FaceSwapper] models loaded (buffalo_l + inswapper_128)`, `[FaceSwapper] source face set (1 face(s) in portrait)`, `[swap] source face set — swap ACTIVE`.

**PENDIENTE — Parpadeo constante en el reflejo (a pulir la próxima)**
- El reflejo aparece pero **parpadea todo el tiempo** (alterna entre cara swapada y cámara normal).
- **Hipótesis principal:** en `orchestrator/src/ws/visionClient.js`, el branch binario hace `this.onFrame?.(raw)` **y además** `this.onSwapFrame?.(b64)` para CADA frame de cámara. Entonces en ESPEJO_ACTIVO el orquestador emite `swap_frame` por dos vías: (a) los frames swapados reales (eventos JSON `swap_frame` del vision service) y (b) cada frame crudo de cámara **sin swapear**. El frontend (`swapImgEl.src`) muestra el último que llega → alterna swapeado/no-swapeado → parpadeo.
- **Fix aplicado (2026-08-15):** en `visionClient.js` se quitó `this.onSwapFrame?.(b64)` del branch binario — los binary frames van SOLO a `onFrame` (preview); el `swap_frame` viene únicamente de los eventos JSON del vision service. **(Pendiente de validar en el flujo completo.)**
- Nota: el vision service manda ~30fps binarios y el swap_thread ~20fps de `swap_frame`, así que el frame crudo "pisa" al swapeado constantemente.

### 2026-08-15 — Preview de cámara CONGELADO (capture thread muerto silenciosamente)

**Síntoma:** el preview del frontend quedaba congelado (una imagen estática) pero TODO el pipeline seguía "vivo" a nivel de red:
- Vision service respondía, conexión establecida, terminal sin errores.
- El orquestador reenviaba frames binarios a cualquier cliente (49 en 3s).
- El navegador recibía los frames binarios, las imágenes cargaban (`img.onload` disparaba), `drawImage` dibujaba imágenes nuevas al canvas de cámara.
- PERO el contenido del canvas no cambiaba: `_test_frames.py` con hash MD5 mostró **55 frames recibidos, 1 solo contenido único, mismo tamaño exacto** → el vision service mandaba el MISMO frame 15/s.

**Root cause:** en `vision-service/src/vision_server.py`, `capture_thread()` hacía `ret, frame = cap.read()` y ante un único `not ret` hacía `break` → el hilo **moría permanentemente** (daemon, sin error visible). `video_buffer` quedaba con el último frame y `send_loop` lo re-enviaba para siempre. La cámara 4K MJPG (2160×3840) es propensa a glitchear y devolver un read fallido transitorio (posiblemente potenciado por el uso de GPU del swap_thread).

**Fix:** `capture_thread()` ahora es resiliente:
- Ante un `cap.read()` fallido: reintenta (no `break`).
- Después de 5 fallos consecutivos: `cap.release()` + **reabre la cámara** (`open_camera()`), con logs `[capture] ...`.
- Solo abandona si no puede abrir ninguna cámara.

**Validación:** tras reiniciar el vision service, `_test_frames.py` mostró **45 frames, 45 contenidos únicos** (cámara viva), y el flujo completo avanzó solo (captura → descripción → LECTURA → "Generando prompt...").

**Lección:** cualquier hilo daemon con un `break` en un loop de captura/cámara congela el sistema silenciosamente. Preferir reintento + reapertura antes que morir. Para diagnosticar frames congelados: contar frames **y comparar contenido** (hash), no solo contar.

### 2026-08-15 — Calidad del swap mejorada (halo pixelado)

**Síntoma:** el reflejo (ESPEJO_ACTIVO) se veía bien pero con un **halo pixelado alrededor de la cara**.

**Root cause:** `swap_thread()` bajaba el frame a **max dim 960** antes del swap (cámara 2160×3840 → 540×960) y el frontend muestra el reflejo fullscreen a 1080×1920 → **estirar 2x = pixelado**. Sumado a JPEG calidad 85 (artefactos de compresión) y downscale con `INTER_LINEAR` (más suave).

**Fix (en `vision_service/src/vision_server.py`):**
- `SWAP_MAX_DIM = 1920` (antes 960) → el swap se genera a **1080×1920 nativo** del frontend.
- `SWAP_JPEG_QUALITY = 92` (antes 85) → menos artefactos alrededor de la cara.
- Downscale con `cv2.INTER_AREA` (más nítido al reducir que `INTER_LINEAR`).
- El costo GPU es casi el mismo: inswapper_128 es invariante a la resolución (cara 128×128); solo sube el costo de paste-back + encode.

**Nota:** el "halo" clásico de inswapper_128 (costura en mandíbula/cabello por el modelo 128×128) puede persistir en menor medida incluso a 1080p. La solución aplicada es **GFPGAN** (ver sección siguiente).

### 2026-08-15 — GFPGAN integrado: la cara deja de estar pixelada

**Síntoma:** tras subir a 1080×1920, la cara seguía pixelada. Causa: **inswapper_128** genera la cara a 128×128 y la estira al tamaño real de la cara en el frame (~3-4x) → cara blanda/bloqueada.

**Solución: GFPGANv1.4 post-swap** (restauración facial con detalle real a 512×512).
- Modelo ONNX descargado de HuggingFace (`Meeperomi/GFPGANv1.4-onnx`, 324MB) → `vision-service/models/GFPGANv1.4.onnx`. Corre con el **onnxruntime-gpu** existente (sin instalar torch).
- Nuevo módulo `vision-service/src/face_enhancer.py`: alinea la cara a 512×512 con el template estándar (los 5 landmarks de insightface coinciden en orden con el template de GFPGAN), corre el modelo, invierte el warp y blendee con máscara elíptica difuminada.
- Se integra en `swapper.py` (`ENHANCE_FACE = True`) — configurable.

**Resultado de calidad:** nitidez de la cara +54% (varianza Laplacian 1.7 → 2.7 a 1080×1920). El halo se elimina porque GFPGAN re-blendea toda la cara (frente + mejillas) con detalle real.

**Rendimiento — optimizaciones para no matar la fps (0.8 → 4.4 fps en servicio):**
1. **Detección del target solo con SCRFD**: `allowed_modules=["detection"]` — el inswapper solo usa `bbox + kps` del target (el embedding lo da el source). Antes `app.get()` corría 4 modelos extra por frame (~328ms).
2. **Paste-back propio liviano**: el `paste_back` nativo de inswapper hace erode/dilate/doble blur sobre TODO el frame 1080×1920 (~124ms). Ahora: `paste_back=False` + warpAffine + máscara elíptica en la región de la cara (~15ms).
3. **Máscaras con feather a baja resolución**: el GaussianBlur del blend con kernel gigante costaba ~73ms; ahora el feather se calcula a 1/8 y se re-escala.
4. **send_loop pausa el encode 4K del preview durante ESPEJO_ACTIVO** (el reflejo tapa el preview; libera CPU/GPU).

**Costos reales (1080×1920):** SCRFD 8ms + inswapper forward 22ms + GFPGAN 40ms + blend ~10ms ≈ 230-300ms/frame → **4.3-4.4 fps** con calidad GFPGAN. Sin GFPGAN: ~6fps (toggle `ENHANCE_FACE`).

**Notas:**
- El modelo GFPGANv1.4.onnx (324MB) NO está en git (agregar a .gitignore si no está).
- El face enhancer usa `cv2.estimateAffinePartial2D` con los kps de SCRFD (orden coincide con el FACE_TEMPLATE).

**Notas de entorno (recurrentes):**
- Los DLLs de cuDNN/CUDA pueden faltar en `onnxruntime/capi` → recopiar de `torch\lib` de ComfyUI (ver Bug 5).
- Verificar siempre que solo UN vision service (`.venv-swap`) tenga el puerto 3001.
- El vision service crashea (exit code 1) si un error no capturado ocurre en `recv_loop` → dejar los comandos de swap protegidos con try/except (ya está).

### 2026-08-16 — Transición de entrada al espejo + resume de sesión

**Estado del swap:** validado end-to-end y funcionando (cara nítida con GFPGAN, sin espejado, sin sombras negras, ~5-6fps). El fix del parpadeo también quedó validado (reflejo estable).

**1. Transición de entrada a ESPEJO_ACTIVO (vórtice → polaroid crece → cobra vida)**

Diseño acordado con el usuario (artístico): el paso de la revelación al reflejo ya no es un corte seco, sino una transición lenta de "espacio latente".

- **Fase 1 — Vórtice (~8s):** todo el contenido del espacio latente (textos flotantes de la descripción, preguntas, fotos/polaroids flotantes, pedazos de cara wireframe `faceAssembly`) se chupa en espiral hacia la **posición de la cara** (tracking en vivo), encogiéndose y desvaneciéndose. Las cajas DOM (`#lectura-thinking`, `#prompt-box`, `#lectura-photo`, `#lectura-status`) también giran y se funden hacia ese punto.
- **Fase 2 — Polaroid crece:** el retrato generado (polaroid central) se despega del stage de revelación, crece hasta ~68% del ancho y **sigue la cara** en tiempo real (tracking espejado), con una respiración sutil. Llena la espera mientras cargan los modelos (~8s).
- **Fase 3 — Cobra vida (~5s):** cuando llega `swap_status ready`, la polaroid se **expande a pantalla completa con distorsión de entrada** (wobble que se asienta) mientras el reflejo en vivo se funde encima.

Cambios:
- `orchestrator/src/ws/visionClient.js` + `index.js`: se reenvía `swap_status` del vision service al frontend (antes caía en "Unknown event"). Es el trigger de "cobra vida".
- `frontend/src/layers/face-assembly.ts`: método `vortex(target, ease)` que chupa las instancias hacia un punto.
- `frontend/src/main.ts`: estado de transición (`espejoTransition`, `espejoReady`, `espejoVortexT`, `espejoCobraT`), funciones `beginEspejoTransition`/`beginEspejoCobraVida`/`endEspejoTransition`, `faceWorldTarget` (convierte la posición normalizada de la cara a coordenadas 3D), `mirroredFaceScreenPos`, `vortexDomElements`, y el bloque en `animate()` que conduce vórtice + polaroid + cobra vida. Gates a los spawns del espacio latente durante la transición.
- **Velocidad:** la convergencia es por SEGUNDO (basada en `dt`), no por-frame exponencial (que convergía en ~0.5s sin importar la duración). Todo ~5x más lento que la primera versión (usuario: "espacio latente, todo va lento pero sin sentirse trabado"). Constantes: `VORTEX_DURATION=8`, `POLAROID_GROW_SPEED=0.35`, `COBRA_DURATION=5`, `VORTEX_SWIRL_RATE=2.6`.

**2. Fallo en la revelación (mostraba solo el resultado y no avanzaba) — causa y fix**

- **Causa (vía logs):** la captura NUNCA fallaba ("Photo saved" siempre). Los fallos eran por **recargas del navegador (HMR de Vite)** disparadas por ediciones dev a `main.ts`. Cada recarga borraba el estado del frontend (foto capturada, retrato) y el orquestador, al ver reconectarse al frontend a mitad de flujo, **reseteaba a REPOSO** ("Previous flow completed — resetting to REPOSO"). Por eso la revelación mostraba solo el resultado (foto original perdida = `capturedPhotoBase64` null) y no avanzaba (flujo reseteado).
- **Fix — resume de sesión (recarga no mata el flujo):**
  - Frontend: persiste `capturedPhotoBase64` y `finalPortraitBase64` en `sessionStorage` (`espejo_photo`, `espejo_portrait`) y los restaura al iniciar.
  - Orquestador (`uiServer.js`): en `hello`, si hay sesión activa a mitad/después del flujo, envía `session_resume` con `photo_b64` + `portrait_b64` (NO resetea a REPOSO). Solo resetea si NO hay sesión.
  - Frontend: maneja `session_resume` — rehidrata; si está en REVELACIÓN re-dispara `doRevealPortrait()` (salta al layout final con las dos polaroids); si está en ESPEJO_ACTIVO muestra el reflejo directo (sin transición).
  - Se limpia `sessionStorage` al volver a REPOSO.

**3. Estado del sistema (2026-08-16):**
- Todos los servicios funcionando: orquestador (3000), vision service (3001, `.venv-swap`), frontend (5173), ComfyUI (8188).
- Typecheck TS: OK. Sintaxis orquestador: OK.

### Pending

- **Calibrar la transición** — duraciones/tamaños/intensidad del vórtice según pruebas de piso del usuario.
- **SOUVENIR + mail** — endpoint REST existe, `mail.js` es stub.
- **CIERRE** — Not implemented.
- **Disolución** (estado 10 del UX flow) — la cara generada se desintegra de vuelta al ruido al cerrar.

### Key Fixes Applied

1. **WebSocket handler signature** — `handler(websocket, path)` → `handler(websocket)` for websockets 16.x.
2. **Environment** — Using `.venv` in project root (not `Face Swap testing/`).
3. **Port 3001** — Freed from zombie process.
4. **Separate capture & detection threads** — Capture loop now only reads camera + stores frames. Detection runs independently at ~5 Hz.
5. **Configurable orientation** — `CAMERA_ROTATION`, `STREAM_SCALE`, `JPEG_QUALITY` constants at top of `vision_server.py`.
6. **Migrated to MediaPipe Tasks** — Replaced InsightFace (presence) + motion-based gesture detection with unified `MediaPipeDetector` using `blaze_face_short_range.tflite` and `hand_landmarker.task`.
7. **Landmark-based wave detection** — Open-hand check (fingertip-to-wrist distance) + wrist oscillation analysis (`_detect_oscillation`). No motion fallback.
8. **Distance-aware presence filter** — Only count faces whose bounding box width exceeds `MIN_FACE_WIDTH_RATIO` of frame width.
9. **Visual debugging overlays** — Face boxes (green), hand skeletons (red/yellow/green), waving banner with fade-out.
10. **Photo capture command** — `capture.py` with `capture_photo()` function; triggered via `capture_photo` JSON command from WebSocket. Saves to `vision-service/captures/`.
11. **Structured JSON events** — Vision service now sends `presence`, `gesture_detected`, and `photo_ready` JSON messages alongside binary frames.

---

## Installed Dependencies (`.venv`)

- `opencv-python` (5.0.0.93)
- `websockets` (16.1.1)
- `mediapipe`
- `numpy` (2.5.1)
- `pillow` (12.3.0)

---

## What's Missing vs. Architecture

Per `espejo-arquitectura-tecnica.md`, the following milestones remain:

### Milestone 1: Vision Service standalone (✅ complete)

- [x] Camera loop + frame streaming
- [x] **Presence detection** — `detector.py` with MediaPipe `FaceDetector`. Distance-aware (min face width ratio).
- [x] **Gesture detection** — `detector.py` with MediaPipe `HandLandmarker`. Open-hand + wrist-oscillation wave detection.
- [x] **Visual debugging overlays** — Face boxes, hand skeletons, wave banner drawn on stream.
- [x] **Latency optimization** — Capture and detection run in separate threads. Capture never blocks on inference.
- [x] **Mirror flip** — `cv2.flip(frame, 1)` for natural mirror experience.
- [x] **Configurable orientation** — `CAMERA_ROTATION` for vertical/portrait mirror setups.
- [x] **Photo capture** — `capture.py` exists and works. Triggered via WebSocket `capture_photo` command. Saves JPEG + returns base64.
- [x] **Structured WS protocol (events)** — Vision service emits JSON `presence`, `gesture_detected`, and `photo_ready` events.
- [ ] **Face swap streaming** — `faceswap.py` not created yet. Needs inswapper integration for live swap frames.
- [ ] **Structured WS protocol (frames)** — Currently sends raw binary JPEG alongside JSON events. Protocol contract expects `{"type": "swap_frame", "image_b64": "..."}` format.

### Milestone 2: Orchestrator skeleton (✅ complete)

- [x] `package.json` with `ws`, `express`, `uuid` dependencies — installed
- [x] `src/index.js` — server bootstrap, wires vision events to state machine
- [x] `src/stateMachine.js` — state machine with all transitions from UX flow
- [x] `src/session.js` — session management (UUID, in-memory asset store, timeout)
- [x] `uiServer.js` — updated with protocol-aware `setupUiServer()`
- [x] `visionClient.js` — updated with event callbacks (onPresence, onGesture, etc.)
- [x] **`src/services/ollama.js`** — ✅ FULLY IMPLEMENTED. Streaming HTTP client to Ollama (`/api/chat`), parses delimited output into `descripcion` / `prompt_en` / `prompt_es`, forwards chunks as `stream_chunk` events. Supports `think` parameter. System prompt in Spanish with structured description format.
- [x] **`src/services/comfyui.js`** — ✅ FULLY IMPLEMENTED. Sends photo + prompt_en to ComfyUI API, queues `EspejoIA.json` workflow, tracks progress via WS, fetches output image via `/api/view`. Callbacks: `onPreview`, `onComplete`, `onError`.
- [x] `src/services/mail.js` — stub (to be implemented)
- [x] `src/routes/souvenir.js` — REST endpoint for souvenir form

### 2026-07-24 — LECTURA animation system + fixes
- **Summary:** Built the full LECTURA state animation system. Face-assembly wireframe pairs, circular reveal transition, centered typing messages, analysis HUD (photo snapshot — BROKEN). Fixed presence detection bug, removed 7s CONGELADO delay, stale session reset on reconnect.
- **New files:** `face-assembly.ts`, `analysis-hud.ts`, `lectura-reveal.ts`, `lectura-text.ts`, `lectura-messages.json`
- **Modified:** `main.ts`, `orchestrator/index.js`, `uiServer.js`, `detector.py`
- **Known bug:** Analysis HUD photo texture not rendering (console logs added)
- [x] **Presence → state wiring** — `onPresence` transitions `REPOSO→DESPERTAR`, resets early states (DESPERTAR, CAPTURA) on absence. After CAPTURA, presence loss does NOT reset (experience continues).
- [x] **Photo capture wiring** — `capture_photo` from frontend → forwarded to vision service. Guard auto-transitions DESPERTAR→CAPTURA if `continue` was lost.
- [x] **Ollama wired to LECTURA state** — On entering LECTURA, starts Ollama stream. On complete, saves prompts to session and transitions to GENERACION.

### 2026-07-24 (late) — LECTURA visuals iteration + thinking box
- **Summary:** Heavy iteration on LECTURA visuals: face wireframe pairs (opposite sides, slow, fade-before-touch, RGB ghost, depth layers), circular white reveal centered on photo, DOM-based photo polaroid with RGB glitch corners + scanner line, typewriter messages. Thinking box built from scratch.
- **New files:** `lectura-thinking.ts`
- **Modified:** `main.ts`, `analysis-hud.ts`, `lectura-text.ts`, `lectura-reveal.ts`, `face-assembly.ts`, `index.html`
- **Key decisions:**
  - Photo HUD switched to DOM (Three.js CanvasTexture didn't work with HTMLImageElement)
  - White reveal shader updated to accept dynamic center (centered on photo, not screen)
  - Text below photo removed (replaced by thinking box)
- **Fixes:** CONGELADO 7s delay removed, stale session reset on reconnect, WS leaveLectura guard for debug mode, encuadre UI cleanup on LECTURA enter, reveal mesh at z=-1 DoubleSide

### 2026-07-24 (night) — Process-transparent thinking box + Ollama description pipeline
- **Summary:** Replaced fake/suggestive thinking messages with real process steps. Restructured Ollama output: model now generates a structured description in Spanish (with `*` bullet fields) before the prompts. Thinking box shows description only (no prompts), auto-closes after reading time.
- **New files:** None
- **Modified:** `ollama.js`, `lectura-thinking.ts`, `main.ts`, `orchestrator/index.js`, `capture.py` (PNG), `analysis-hud.ts` (centered photo)
- **Ollama protocol change:** Added `descripcion` channel (content before `[PROMPT_EN]` delimiter). Model outputs structured description in Spanish with `*` bullets → `[PROMPT_EN]` → `[PROMPT_ES]`.
- **Delimiter detection:** Changed to use `[` as universal trigger (catches any partial `[P`, `[PR`, `[PRO`, `[PROMPT`, etc.)
- **Thinking box v3:**
  - Box opens at 33% viewport height (not 50%)
  - Console-style spinner (`/ - \ |`) while generating
  - Shows only structured description (no prompts)
  - Auto-closes after 6s with slide-down animation (no scrollbar)
  - Text below photo: "Esperando descripción..." → hidden → "Generando prompt para la imagen..."
- **Photo:** Centered on screen, PNG format (lossless), 1440×2560
- **Fixes:** Multiple delimiter partial-match edge cases (`[PROMPT_`, `[PROMPT`, bare `[`)

### Key Fixes Applied (Session 2026-07-22)
- **`ollama.js` duplicate `module.exports`** — Removed leftover `streamNarration` function that overrode the real `startStream` export.
- **Ollama `espejo-vl` custom model** — Created Ollama model from local GGUF files (`Qwen3-VL-8B-Instruct-abliterated-v2.0.Q5_K_M.gguf` + `mmproj-f16.gguf`) using `ADAPTER` directive in Modelfile.
- **Presence hysteresis** — Added `ABSENCE_MIN_FRAMES = 30` (~6s) to prevent flickering presence resets. Separated detection and loss counters.
- **No presence reset after CAPTURA** — Once photo is taken, presence loss no longer resets state to REPOSO.
- **Frontend camera crop (landscape → portrait)** — Added `drawImage` source cropping for built-in webcam (1920×1080 landscape → center portrait crop) to avoid stretching.
- **`CAMERA_ROTATION = None`** — Built-in webcam doesn't need rotation (natively landscape).
- **capture_photo guard in uiServer.js** — If frontend sends `capture_photo` while in DESPERTAR (missing `continue`), auto-transitions to CAPTURA.

### Milestone 3: Frontend (✅ REPOSO + LECTURA complete)

- [x] **Vite + Three.js + TypeScript project scaffolded** — Fullscreen 1080×1920 portrait, pixel-ratio clamped, antialias off.
- [x] **REPOSO state fully implemented** — Immersive 3D scene with camera at origin:
  - Voronoi noise field shader (full-screen plane) with dark indigo/cyan/magenta palette, scan lines, grain, vignette, corner brackets, chromatic drift.
  - 50 floating 3D wireframe face fragments (13 models extracted from `head2.glb`) with RGB-ghost glitch and rise/fall lifecycle.
  - 150+ word sprites at 5 depth layers with blur, repulsion from face box.
  - 120 floating word sprites, 4 code-typing snippets, 8 bias-detection snippets, 800+ particles, constellation lines, light bursts, nebula, grid.
- [x] **LECTURA state fully implemented:**
  - Circular white reveal shader (centered on photo position, 2.2s)
  - Face-assembly: 15 wireframe pairs from opposite sides, very slow (30-65s cycle), fade before touch, RGB ghost, 4 depth bands
  - Polaroid photo HUD (DOM-based): white border, RGB ghost corners, scanner line with glow
  - Process-transparent thinking box: console spinner, structured description streaming, auto-close
  - Waiting text below photo: "Esperando descripción..." → hidden → "Generando prompt para la imagen..."
- [x] **Face tracker** — `FaceTracker` class with mock mode (sine-wave motion) and smooth interpolation. Ready for WebSocket input.
- [x] **Frontend state machine** — `FrontendStateMachine` with all flow states, change listeners.
- [x] **WebSocket client** — `WsClient` connecting to orchestrator (port 3000), auto-reconnect, JSON event dispatch.
- [ ] **Wire WS client to visuals** — Face tracker needs to receive real coordinates from orchestrator; state machine needs to trigger scene transitions.
- [ ] **Sphere shader** — Voronoi sphere created but not yet added to scene (WIP).
- [ ] **Other states** — DESPERTAR, CAPTURA, GENERACION, etc. not yet implemented.

### Milestones 4–9 (❌ not started)

- [ ] Connect Vision Service ↔ Orchestrator (replace manual triggers with real events)
- [ ] Integrate Ollama (streaming thinking/prompt)
- [ ] Integrate ComfyUI (generation with previews)
- [ ] Live face swap (Espejo Activo state)
- [ ] Souvenir + mail (QR, mini-page, email sending)
- [ ] Edge polish (timeouts per state, abandonment handling, cross-state reset)

---

## How to Run

### Start Vision Service (port 3001)

```powershell
cd "d:\Diplo IA\Proyecto Final\Epejo IA"
& ".venv/Scripts/python.exe" vision-service/src/vision_server.py
```

### Start Orchestrator (port 3000)

```powershell
cd "d:\Diplo IA\Proyecto Final\Epejo IA\orchestrator"
npm install  # first time only
node src/index.js
```

### Start Frontend (port 5173)

```powershell
cd "d:\Diplo IA\Proyecto Final\Epejo IA\frontend"
npm run dev
```

Then open `http://localhost:5173` in a browser. The full pipeline (Vision Service → Orchestrator → Frontend) must be running: start vision service first, then orchestrator, then frontend.

---

## Protocol Contracts (Quick Reference)

### Vision Service → WebSocket clients (raw JPEG binary currently)

Eventually should emit JSON:

| Type | Direction | Payload |
|------|-----------|---------|
| `presence` | VS → Orchestrator | `{"type":"presence","value":true/false}` |
| `gesture_detected` | VS → Orchestrator | `{"type":"gesture_detected","gesture":"wave"}` |
| `photo_ready` | VS → Orchestrator | `{"type":"photo_ready","image_b64":"..."}` |
| `swap_frame` | VS → Orchestrator | `{"type":"swap_frame","image_b64":"..."}` |

### Orchestrator → Frontend

| Type | Payload |
|------|---------|
| `state` | `{"type":"state","state":"REPOSO"}` |
| `countdown` | `{"type":"countdown","value":3}` |
| `flash` | `{"type":"flash"}` |
| `photo_captured` | `{"type":"photo_captured","image_b64":"..."}` |
| `stream_chunk` | `{"type":"stream_chunk","channel":"thinking_es","text_delta":"...","done":false}` |
| `gen_preview` | `{"type":"gen_preview","image_b64":"...","step":3,"total_steps":8}` |
| `final_portrait` | `{"type":"final_portrait","image_b64":"..."}` |
| `swap_frame` | `{"type":"swap_frame","image_b64":"..."}` |
| `qr_ready` | `{"type":"qr_ready","url":"https://..."}` |
| `reset` | `{"type":"reset"}` |

---

## Known Issues

- **Camera index** — Hardcoded `cv2.VideoCapture(0)`. May differ on some machines.
- **Binary frame format** — Vision service still sends raw JPEG binary for the live video stream (alongside JSON events). Should eventually wrap frames in structured JSON per protocol contract (e.g., `{"type": "swap_frame", "image_b64": "..."}`).
- **Frontend WS not wired** — The frontend `WsClient` and state machine are defined but not yet connected to the orchestrator. REPOSO runs standalone with mock data. Face tracker mocking is used instead of real coordinates.
- **Sphere shader WIP** — Voronoi sphere exists (`sphere-shader.ts`) but is not added to the scene yet.
- **Multi-person handling** — When multiple faces are detected, the system does not yet select the closest as primary. All close faces trigger presence; hands are tracked for all detected hands.
- **Face Swap testing/** folder — Contains an older venv and `inswapper_128.onnx` model. May be useful as reference for the faceswap implementation.

### 🔍 Para Revisar

- ~~**Prompt se carga dos veces**~~ ✅ **FIXED** — Era en `comfyui.js`: los textos de los nodos 69 (`prompt_es`) y 75 (`descripcion`) se enviaban por WebSocket (`executed` event) y después se reenviaban desde el history polling. Fix: se agregó un `Set(streamedChannels)` que trackea qué canales ya se enviaron por WebSocket, y el history fallback salta los que ya están. También se agregó el nodo 64 (`prompt_en`) al channelMap del WebSocket (antes solo venía por history).
- **Evaluar si conviene usar dos workflows de ComfyUI en paralelo** — Probar si lanzar dos ejecuciones simultáneas del workflow (con diferentes semillas/configs) reduce la latencia total, aprovechando mejor la GPU. Si una termina antes, se usa esa. Hacer una rama de prueba (`experiment/dual-comfy`) para comparar tiempos.

---
## Recent Updates

### 2026-07-20 — Frontend REPOSO state built
- **Summary:** Created the frontend as a standalone Vite + Three.js + TypeScript project. REPOSO state renders an immersive 3D scene: camera at origin looking outward into a "latent space" composed of a Voronoi noise field shader, 50 floating 3D wireframe face fragments (extracted from a GLB head model), 150+ word sprites at varying depths, code-typing and bias-detection snippets, particles, constellation lines, and light bursts. A `FaceTracker` with mock mode, `FrontendStateMachine`, and `WsClient` are defined and ready for wiring.
- **Key decisions:**
  - Used real 3D wireframes from a GLB model (via `tools/extract-face-parts.cjs`) instead of 2D sprite sheets.
  - 3D perspective camera at origin instead of flat 2D — creates "immersed inside" feel.
  - Multiple layered Three.js elements instead of a single unified WebGL pass.
  - Anti-aliasing off, pixel ratio clamped for intentional lo-fi aesthetic.
  - Face tracker mock drives the shader's box position and disturbance uniforms.
  - WS client and state machine defined but not yet wired to visuals.
- **Files created:** frontend/ (full scaffold), 13 face-part GLB models, shaders, layers, tools/extract-face-parts.cjs.

### 2026-07-20 — Camera feed overlay + mirror fix + typing dialog
- **Summary:** Wired the frontend to the live pipeline (Vision Service → Orchestrator → Frontend). Implemented camera feed as a DOM canvas overlay with radial reveal animation centered on the face, smooth fade transitions, white bounding box with RGB glitch ghosts, and IVCam vertical camera support. Resolved a complex mirror/flip saga (ended up: no flipping needed — IVCam already sends mirrored). Added face box 2x scaling. Built an interactive typing dialog system below the face box, with auto-advance (1s between texts) and internal mid-text pauses (`||` = 0.5s, `|N|` = custom). Hint only appears after last text with hand-wave icon. Reduced wave cooldown from 18s to 2s.
- **Key decisions:**
  - Dialog system: auto-advance for first 11 texts, wave-only for last text to trigger `continue`.
  - `||` marker for 0.5s mid-text pauses (speaking rhythm), `|N|` for custom durations.
  - Dialog speed at speaking pace (6-15 chars/s).
  - Hint only visible when all dialogs shown (`dialogAllShown`), not during auto-advance.
  - Wave cooldown reduced to 10 frames (2s at 5Hz).
- **Files changed:**
  - `frontend/src/main.ts` — Camera overlay, face box, typing dialog, hint with icon, wave handlers, edge clamping, auto-advance, `||` pause markers.
  - `frontend/src/data/dialogs.ts` — Final dialog texts with pauses.
  - `vision-service/src/detector.py` — Reduced `WAVE_COOLDOWN_FRAMES` from 90 to 10.
  - `orchestrator/src/index.js` — Gesture forwarded to frontend.
  - `orchestrator/src/ws/uiServer.js` — `continue` handler for DESPERTAR→CAPTURA.

### 2026-07-22 — Pipeline decision: inswapper + GFPGAN for face swap
- **Summary:** Defined the final pipeline architecture. After evaluating LivePortrait (KlingAI), decided it's for animating static faces, not real-time face swap. The Espejo Activo state will use inswapper_128 (already in `Face Swap testing/`) + GFPGAN for face restoration, running as a standalone Python service. Updated the architecture doc with the complete pipeline: Capture → Ollama → ComfyUI → Face Swap → Frontend. Renumbered milestones to reflect the new plan.
- **Key decisions:**
  - Face swap uses inswapper_128 + GFPGAN, not LivePortrait.
  - Face Swap Service runs as independent Python WS server (port 3002).
  - Orchestrator forwards camera frames to Face Swap Service during ESPEJO_ACTIVO state.
  - Pipeline: CAPTURA → CONGELADO (show photo + start Ollama) → LECTURA (stream thinking/prompt) → GENERACION (ComfyUI previews) → REVELACION (show final portrait) → ESPEJO_ACTIVO (live swap) → SOUVENIR → CIERRE.
- **Files changed:**
  - `docs/espejo-arquitectura-tecnica.md` — Replaced LivePortrait section with inswapper+GFPGAN, added full pipeline flowchart and state descriptions.
  - `docs/progress.md` — Added this entry.

### 2026-07-22 — Encuadre (positioning) + alignment + countdown + capture
- **Summary:** Built the full encuadre/positioning phase after the dialog flow. When the user waves after the last text: (1) the face bounding box morphs via CSS transition from a square at face position to a centered oval guide (1.2s), (2) a dark backdrop with oval cutout appears, (3) a subtle face-tracking oval follows the user's face (same size as guide), (4) when both ovals align within threshold (30% of oval width for ≥0.8s), the text changes to "mirá a la cámara...", the backdrop is replaced by a bright white overlay (85% opacity, same oval cutout) turning the screen mostly white, (5) after 1.5s of steady alignment, a 3-2-1 countdown appears in large Pixelify Sans font above the oval, (6) at 0, a full-white flash + `capture_photo` is sent to the orchestrator. Misalignment at any point resets to the positioning phase. The 100% camera face area is also clipped to an oval matching the guide dimensions. The orchestrator's CAPTURA state no longer does its own countdown (frontend handles it); the orchestrator transitions naturally: DESPERTAR→CAPTURA (on `continue`) → CONGELADO (on `photo_ready` from vision service).
- **Key decisions:**
  - Encuadre handled by frontend locally; orchestrator just tracks CAPTURA state.
  - Guide oval sized at 35% viewport height, 0.72 aspect ratio (face-proportional).
  - Alignment threshold = 30% of oval width (forgiving, not pixel-perfect).
  - Backdrop hidden during bright phase to avoid gray-on-gray.
  - Orchestrator's CAPTURA countdown removed (was 10s, conflicting with frontend's ~5s flow).
  - `?encuadre` URL param remains for debug (skips dialogs, jumps straight to positioning).
- **Files changed:**
  - `frontend/src/main.ts` — `enterEncuadre()` function, oval guide, face tracking oval, alignment detection, phase machine (position/aligned/countdown), typing effect for encuadre texts, bright overlay with cutout, countdown display, flash, `continue` send on encuadre entry, stale wave reset on last text.
  - `orchestrator/src/index.js` — Removed automatic countdown/capture from CAPTURA state.
  - `orchestrator/src/ws/uiServer.js` — Added `capture_photo` handler forwarding to visionClient.

### 2026-07-19 — MediaPipe migration + multi-person selection

- **Date:** 2026-07-19
- **Summary:** Switched vision detection to MediaPipe Tasks (`hand_landmarker.task` + `face_detection_short_range.tflite`), removed the motion-fallback, and implemented landmark-based open-hand + wrist-oscillation wave detection. Added visual debugging overlays and integrated the detector into `vision_service/src/vision_server.py` to stream annotated frames and JSON events.
- **Files changed:** vision-service/src/detector.py, vision-service/src/vision_server.py, vision-service/models/*

### 2026-07-22 — Ollama integration + end-to-end pipeline test
- **Summary:** Implemented the Ollama bridge service (`orchestrator/src/services/ollama.js`) that calls the local Ollama instance with the captured photo, streams the response token-by-token, and parses delimited output into `prompt_en` / `prompt_es` channels. Created a custom Ollama model (`espejo-vl`) from local GGUF files (`Qwen3-VL-8B-Instruct-abliterated-v2.0`). Wired Ollama into the orchestrator's LECTURA state: on entering LECTURA, starts the stream; on complete, saves prompts to session and transitions to GENERACION. Tested the full pipeline end-to-end: presence → DESPERTAR → dialog → wave → CAPTURA → photo → CONGELADO → LECTURA → Ollama responds → GENERACION. Ollama successfully described the face and generated both English and Spanish prompts (~8s).
- **Key fixes:**
  - Removed duplicate `module.exports` that was overriding `startStream`.
  - Added presence hysteresis (`ABSENCE_MIN_FRAMES = 30`) to prevent flickering resets.
  - After CAPTURA, presence loss no longer resets to REPOSO (experience continues).
  - Added `capture_photo` guard in uiServer.js: auto-transitions DESPERTAR→CAPTURA if `continue` was lost.
  - Fixed built-in webcam landscape→portrait cropping in frontend drawImage.
- **Ollama model:** Custom `espejo-vl` created from GGUF files at `C:\ComfyUI\ComfyUI-Easy-Install\ComfyUI\models\LLM\`. Uses `ADAPTER` for mmproj. ~6s latency for vision+generation.

### 2026-07-25 — UI consistency pass: RGB ghosts, Consolas, dialog/descripción/prompt restyle
- **Summary:** Major UI consistency pass. All black box borders unified with dynamic RGB ghosts, fonts standardized to Consolas, dialog restyled with fade-in/out per box, status/hint text re-styled to match prompt box title (italic, uppercase, `>` prefix), encuadre text moved to same style, thinking box repositioned to match prompt box location, waiting text now has ASCII spinner (`| / - \`), text flow simplified (full text at once, no typing/segment reveal). Demo fallback path removed.
- **Modified:** `frontend/src/main.ts`, `frontend/src/layers/lectura-thinking.ts`
- **RGB Ghosts unified:** All UI boxes (face bounding box, encuadre oval, photo HUD, dialog, thinking box, prompt box) now share same border style: `1px` white border + 3 RGB ghosts (`position:absolute; inset:-1px`) with dynamic glitch animation (random offset every 0.06-0.16s, smooth recovery).
- **Font standardization:** `Consolas, "Courier New", monospace` everywhere. No bold. No Pixelify Sans. No Source Code Pro. Google Fonts import removed from HTML.
- **Dialog system rewritten:**
  - Full text appears at once (no typing chars, no segment reveal via `||`)
  - Each dialog box fades out completely before next fades in (opacity transition)
  - Last dialog stays visible, shows hint "saluda con la mano" inside box
  - Position follows face bounding box (below it)
  - Auto-advance timing based on text length (4-12s)
- **Status/hint text:** `statusEl` and `hintEl` now use the same style as prompt box title: italic, uppercase, letter-spacing, `>` prefix, Consolas.
- **Descripción (thinking) box:** Repositioned to `top: +120px` (same as prompt box, was `+50px`).
- **Encuadre text:** Restyled to match status text (italic, uppercase, letter-spacing, white `#fff`), now reads `> Colocá tu cara haciendo coincidir los óvalos` with `white-space: nowrap`.
- **Waiting text spinner:** Added `| / - \` ASCII spinner that updates in animation loop via `#waiting-spinner` element. Text #2 ("Describiendo...") now appears when thinking box is shown (not on chunk arrival).
- **Text flow:**
  1. "Esperando descripción del modelo tras el espejo..." (initial)
  2. "Describiendo a la persona frente al espejo..." (when thinking box appears)
  3. "Generando prompt para la imagen..." (after description done, box closes)
  4. "Creando contornos de la cara..." (when prompt box is shown)
- **Fixed:** Extra `}` syntax error that broke the dialog logic (caused "unexpected else").

### 2026-07-26 — ComfyUI API bridge + GENERACION state wiring
- **Summary:** Built the ComfyUI integration. The orchestrator now sends the captured photo + `prompt_en` to ComfyUI's API, queues the EspejoIA workflow, and receives the generated portrait. State machine transitions from LECTURA → GENERACION → REVELACION.
- **New files:** `EspejoIA.json` (API-exported workflow in project root)
- **Modified:** `orchestrator/src/services/comfyui.js` (rewritten from stub), `orchestrator/src/index.js` (GENERACION handler)
- **ComfyUI workflow (`EspejoIA.json`):**
  - **Node 53:** `UNETLoader` → `z_image_turbo_fp8_e4m3fn.safetensors`
  - **Node 18:** `ModelPatchLoader` → `Z-Image-Turbo-Fun-Controlnet-Union.safetensors`
  - **Node 3:** `CLIPLoader` → `qwen_3_4b.safetensors` (lumina2)
  - **Node 4:** `CLIPTextEncode` — receives dynamic `prompt_en` from Ollama
  - **Node 11:** `LoadImage` — receives captured photo
  - **Node 49:** `AIO_Preprocessor` (LineartStandardPreprocessor, 512px)
  - **Node 19:** `QwenImageDiffsynthControlnet` (strength 0.9)
  - **Node 7:** `EmptyLatentImage` (1024×1024)
  - **Node 6:** `KSampler` (8 steps, euler, cfg=1, simple scheduler)
  - **Node 8:** `VAEDecodePlusPlus`
  - **Node 10:** `SaveImage` — output saved as `espejo_output_*.png`
- **`comfyui.js` service:**
  - Saves captured photo to `C:\ComfyUI\ComfyUI-Easy-Install\ComfyUI\input\`
  - Queues workflow via `POST /api/prompt`
  - Tracks progress via ComfyUI WebSocket (`progress` events)
  - Polls `GET /api/history/{prompt_id}` for output images
  - Fetches result via `GET /api/view`
  - Callbacks: `onPreview({step, total_steps})`, `onComplete({image_b64})`, `onError(err)`
- **`index.js` GENERACION handler:**
  - Reads `prompt_en` + `photo` from session store
  - Calls `comfyuiService.generate()` with callbacks
  - `onPreview` → broadcasts `gen_preview` to frontend
  - `onComplete` → saves portrait to session, broadcasts `final_portrait`, transitions to REVELACION
  - `onError` → broadcasts error, still transitions to REVELACION
- **Tested:** Full pipeline end-to-end: face detection → dialogs → wave → encuadre → capture → LECTURA (Ollama) → GENERACION (ComfyUI) → REVELACION. Successful execution: photo saved to ComfyUI input folder, workflow queued (prompt_id generated), output fetched.
- **Summary:** Replaced the built-in webcam with the new Raptor Vision 4K webcam (CAMERA_INDEX=1, native 1440×2560 portrait). Implemented camera feed mirror (CSS `scaleX(-1)` on canvas + mirrored X for DOM elements). Added camera arrow indicator with "mirá la\ncámara" and "¡Sonreí!" text during encuadre. Replaced the Ollama model from custom `espejo-vl` (Qwen3-VL-8B, no thinking) to **Gemma 4 12B** (vision + native thinking via `think: true` parameter). System prompt now asks Gemma to reason in Spanish step by step. Thinking is accumulated and saved as `pensamiento_es`. Prompts are much more detailed with forced requirements (age range, face shape, eyes, nose, lips, skin texture, pores, scars, moles, piercings, tattoos, lighting, framing, etc.).
- **Key fixes:**
  - Camera mirror: CSS `scaleX(-1)` on canvas + mirrored `p.x` for DOM overlays (box, oval, dialog text).
  - `completed` guard in Ollama stream processing to prevent double-triggering `onComplete`.
  - `processDelta` signature fixed (was passing `true` as thinkingDelta instead of isLast).
  - Thinking now accumulated in `accumulatedThinking` variable (before was always empty).
  - Logging split into 400-char chunks to avoid terminal truncation.
- **Model:** `gemma4:12b` (7.6GB) — supports `think: true` for native reasoning. ~15s latency (slower but includes reasoning).
- **Files changed:**
  - `frontend/src/main.ts` — CSS mirror, mirrored X for box/oval/dialog, camera arrow + "¡Sonreí!" during encuadre.
  - `orchestrator/src/services/ollama.js` — `gemma4:12b` as default, `think: true` enabled, accumulated thinking, English system prompt, `completed` guard.
  - `orchestrator/src/index.js` — Better logging (400-char chunks), removed duplicate prompt_en set.
  - `orchestrator/src/ws/uiServer.js` — `capture_photo` guard for DESPERTAR→CAPTURA.
  - `vision-service/src/vision_server.py` — `CAMERA_INDEX=1`, `CAMERA_ROTATION=None`.
  - `vision-service/src/detector.py` — Presence hysteresis.
  - `tools/check_cameras.py`, `tools/check_hf_repo.py` — Utility scripts.
- **Ollama models cleaned:** Removed `espejo-vl` (7GB) and `qwen3.5-9b-dsv4-flash` (5.6GB).

### 2026-07-26 (late) — Stream phase fix + ComfyUI node mapping update
- **Summary:** Fixed two issues found during end-to-end testing. (1) The stream processing in the frontend didn't handle the `idle` phase. (2) Updated the ComfyUI node channel mapping.
- **Modified:** `frontend/src/main.ts`, `orchestrator/src/services/comfyui.js`
- **Fixes:**
  - Stream phase now accepts `idle` → `descripcion` transition
  - Description delta rendered even when `done` flag is true
  - ComfyUI node map corrected

### 2026-07-26 (night) — Multi-fix session: prompt duplicado, orden descripción, wave detection, anotaciones, morph canny
- **Summary:** Heavy debugging session. Fixed 5+ issues across the pipeline.
- **Fixes:**
  1. **Prompt duplicado** (`comfyui.js`): Los textos de nodos QwenVL se enviaban por WebSocket (`executed` event) y luego se reenviaban desde history polling. Se agregó `Set(streamedChannels)` para trackear canales ya enviados y saltarlos en el fallback. También se agregó nodo 64 (`prompt_en`) al channelMap del WebSocket.
  2. **Prompt box aparecía antes que la descripción** (`main.ts`): En el workflow de ComfyUI, nodo 69 (`prompt_es`) se ejecuta antes que 75 (`descripcion`). Se agregó flag `promptESDeferred` para diferir el prompt box hasta que la descripción termine su lectura.
  3. **Diálogo se reiniciaba al perder presencia** (`main.ts`): Se agregó `dialogAbsenceTimer` (4s de gracia) para que una pérdida breve de rostro no reinicie los diálogos.
  4. **Wave detection no funcionaba** (`detector.py`): `WAVE_HISTORY_SIZE=6` pero `_detect_oscillation` requería mínimo 8 muestras — nunca detectaba. Se corrigió usando `WAVE_HISTORY_SIZE`. Además se redujo `WAVE_MIN_ZERO_CROSSINGS` de 4→2, `WAVE_HISTORY_SIZE` de 12→6, y el umbral de mano abierta de 3→2 dedos.
  5. **Anotaciones de mano en stream** (`vision_server.py`): Se activó `annotate_frame()` en el send loop para mostrar landmarks de mano (blancos normal, verde al saludar). Se eliminó face box y overlay de "SALUDO DETECTADO".
  6. **Morph photo→canny edge** (`main.ts`): Cuando llega `canny_ready` (al completar ComfyUI), la foto mutea a los contornos Canny y el texto cambia a "Iniciando generación del reflejo".
- **Modified:** `frontend/src/main.ts`, `orchestrator/src/services/comfyui.js`, `vision-service/src/detector.py`, `vision-service/src/vision_server.py`

### 2026-07-27 — UX redesign LECTURA + ComfyUI two-phase pipeline + face snapshots flotantes
- **Summary:** Complete redesign of LECTURA flow. Simplified welcome dialog (single box), eliminated waiting spinner, redesigned reading flow with countdown + wave-to-advance. Added floating face snapshots (polaroid-style B&W with scanlines + RGB ghost glitch) during thinking phase, then swap to canny edge. Implemented two-phase ComfyUI pipeline (text prompt → parallel image gen). Canny edge arrives early via aggressive polling and feeds into the visual flow.
- **UX Changes:**
  - Welcome dialog: simplified to single box with slide-up entrance, `WELCOME_TEXT` replaces old `DIALOGS` array.
  - Fill light: changed to warm tone (`rgba(255,225,190,0.45)`), flash to `rgba(255,210,170,0.5)`.
  - Encuadre: position guidance hints added. Oval increased from 35%→44% vh. Capture targets 1024×1024.
  - Status text: two-line layout with main text + countdown subtitle. Yellow color `rgb(220,210,120)`.
  - LECTURA countdown: "Tiempo restante estimado: 15s" → counts down, at 0 shows "Capturando los últimos detalles...".
  - When descripcion arrives: thinking box appears with "> DESCRIPCIÓN" title, text streams in. Yellow bullets.
  - Post-wave phases: "Saludo detectado" → "Generando prompt..." (2s countdown) → "Prompt completado ✓" (2s, shows prompt box) → "Generando contornos de la cara..." (15s countdown, or until canny arrives) → "Enviando contornos y prompt...".
  - Camera opacity: 0.35 during wave-waiting phase for hand tracking visibility.
  - Wave timer: 1.5s minimum before accepting wave. Old waves reset when descripcion arrives.
- **Face Snapshots Flotantes:**
  - 100 floating polaroids with B&W + strong scanlines effect + RGB ghost glitch.
  - 3D rotation (THREE.Mesh with PlaneGeometry instead of Sprite).
  - Different depths (some very close at z=-0.08, others far at z=-8.3).
  - Ghost glitch matches wireframes pattern: timer-driven (60-160ms), RGB bursts, position jitter, color decay toward gray.
  - Persist throughout LECTURA. When canny arrives, textures swap from photo to canny edge.
  - Question sprites (20 questions like "¿Qué edad tiene?") float during thinking phase, destroyed when descripcion arrives.
- **ComfyUI Pipeline:**
  - Two-phase: text workflow (QwenVL) + image workflow (Z-Image Turbo + ControlNet).
  - Phase 2 triggers immediately when prompt_en is available (parallel execution).
  - Canny edge polled aggressively (300ms) and sent to frontend as soon as available.
  - Image workflow uses `EspejoIA_image.json` with node mapping: 11→LoadImage, 4→CLIP (prompt_en), 56→Canny output, 10→portrait output.
- **Orchestrator:** `comfyui.js` rewritten with dual workflow loading, `pollForImage()` for early canny detection, race condition guard (10s wait for imagePromptId).
- **Frontend fixes:**
  - Canny double-prefix bug fixed (`data:image/png;base64,` applied twice).
  - Cross-fade on canny morph (opacity 0→0.3s→swap→opacity 1) + flash pulse.
  - Box titles changed to yellow: `> DESCRIPCIÓN`, `> PROMPT (ES)`, `> ESPEJO IA`.
  - Prompt box positioned matching thinking box.
  - Floating text sprites (questions + description) use yellow asterisks.
  - Face snapshots can be mirrored via existing CSS `transform: scaleX(-1)` on `imgEl`.
- **Known Issue:** `prompt_es` se corta — el texto del prompt en español llega truncado desde ComfyUI (el nodo ShowText no envía el texto completo o el LLM lo genera incompleto). Pendiente de diagnosticar.
- **Files modified:**
  - `frontend/src/main.ts` — LECTURA flow, face snapshots, question sprites, canny morph, status text, wave timer, camera opacity.
  - `frontend/src/layers/lectura-thinking.ts` — Simplified, yellow title.
  - `frontend/src/layers/prompt-box.ts` — Yellow title, scrollable, position fix.
  - `frontend/src/layers/analysis-hud.ts` — Floating animation, photo size adjustments.
  - `frontend/src/data/dialogs.ts` — Rewritten: WELCOME_TEXT, WAVE_SVG, CHECK_SVG.
  - `orchestrator/src/index.js` — onCannyReady callback.
  - `orchestrator/src/services/comfyui.js` — Complete rewrite: two-phase pipeline, dual workflow loading, early canny polling.
  - `frontend/public/face-effects-preview.html` — New: visual effect preview tool.

---

## Plan de experimento: `experiment/faster-times`

### Objetivo
Reducir tiempos de generación e interacción. Repensar flujo de estados para hacerlo más ágil.

### Ideas por estado

| Estado | Decisión |
|--------|----------|
| **REPOSO** | ✅ Sin cambios |
| **DESPERTAR** | 🔧 Simplificar — los diálogos son muy largos. Reducir cantidad de textos o acelerar auto-avance |
| **CAPTURA** | ✅ Igual. Quizás ajustar iluminación/luz de relleno |
| **CONGELADO** | ❌ Eliminar — innecesario. Transición directa CAPTURA → LECTURA |
| **LECTURA** | 💡 Oportunidad grande. Separar generación de texto en un workflow de ComfyUI solo para texto (QwenVL). Repensar cómo se muestra la info en frontend (timing, animaciones, qué se ve y cuándo) |
| **GENERACION** | 💡 Capturar `prompt_en` y mandar foto + canny al prompt de imagen. Definir cómo mostrar: canny edge, prompt, y pasos de generación en frontend. Armar backend que aún no está hecho |
| **REVELACION** | 💡 Cuando carga la cara nueva, animación en frontend para que backend gane tiempo para face swap. Animación que revele el face swap |
| **ESPEJO_ACTIVO** | 💡 Infinito hasta gesto específico para terminar. El gesto debe ser algo que no se triggerée fácil mientras la persona se mueve probando el face swap |
| **SOUVENIR** | 💡 QR que la persona escanea → accede a interfaz en el celular → pone su mail → recibe todo |
| **CIERRE** | 💡 Por definir |

### Reset
- Después de CAPTURA: si se pierde presencia > **20s**, volver a REPOSO
- En estados avanzados (LECTURA+): **no resetear** (para no tener que reprobar todo desde cero)

---

## Next Steps (prioritized)

1. **Frontend animation during LECTURA** (~15s while Ollama processes) — Show dynamic visual feedback: animated thinking particles, floating text fragments, evolving word cloud from the captured photo, morphing face box, or progressive reveal animation. The photo is already shown (`photo_captured` event), and `stream_chunk` events arrive as the thinking/prompts are generated — they could be displayed with typing animation.

2. ✅ **ComfyUI bridge** — Implemented. `comfyui.js` sends photo + `prompt_en`, receives portrait via ComfyUI API.

3. **Face Swap Service** — Python WS server on port 3002 using inswapper_128 + GFPGAN.

4. **Frontend states CONGELADO+** — Implement CONGELADO, LECTURA, GENERACION, REVELACION, ESPEJO_ACTIVO, SOUVENIR, CIERRE in the frontend.

5. **Wire `stream_chunk` in frontend** — Display typing text per channel (thinking_es, prompt_en, prompt_es) during LECTURA.

6. **Wire `gen_preview` / `final_portrait` in frontend** — Show generation previews and final portrait.

7. **Souvenir + mail service** — QR, mini-page, email sending.

8. ✅ **Prompt duplicado — FIXED** — Era el history fallback en `comfyui.js` que reenviaba textos ya enviados por WebSocket.

- **Behavior:** Presence uses a distance filter (min face width ratio); wave detection requires open-hand + oscillation; annotated JPEG frames are streamed over WebSocket; captures saved to `vision-service/captures/`.
- **Multi-person selection ✅** — Implemented and tested. The closest person (largest face bounding box) is chosen as primary; only they count for presence; hands are filtered by proximity to the primary face. Face box drawn in blue with "PRIMARY" label.

---

## Suggested Next Steps

1. ✅ **Implement multi-person selection** — When multiple faces are detected, select the closest (largest face bounding box) as the primary person. Only the primary counts for presence; hands are filtered by proximity to the primary face.
2. ✅ **Frontend REPOSO state** — Built with Vite + Three.js + TS. Voronoi noise shader, 3D wireframe face fragments, floating text, particles, code/bias snippets, face tracker mock.
3. ✅ **Wire frontend WS to orchestrator** — Connected `WsClient` to orchestrator, real face coordinates feed `FaceTracker`, camera feed overlay displays live stream.
4. ✅ **Camera feed overlay** — DOM canvas with radial reveal, face bounding box, typing dialog with auto-advance + mid-text pauses, gesture-driven `continue` signal.
5. ✅ **Encuadre (positioning) phase** — Oval guide morph animation, face tracking oval, alignment detection, bright overlay, 3-2-1 countdown, flash + capture. Orchestrator transitions DESPERTAR→CAPTURA→CONGELADO automatically.
6. **Build CONGELADO → LECTURA → GENERACION pipeline** — Connect photo capture → Ollama (streaming thinking/prompt) → ComfyUI (generation with previews) → final portrait.
7. **Build Face Swap Service** — Python WebSocket server with inswapper_128 + GFPGAN for live swap.
8. **Build REVELACION + ESPEJO_ACTIVO states** — Animate final portrait transition, then live face swap.
9. **Build SOUVENIR + CIERRE** — QR, mail form, email sending, dissolution animation.
10. **Parameterize thresholds** — Expose `MIN_FACE_WIDTH_RATIO`, `WAVE_MIN_AMPLITUDE`, cooldowns via config file.
