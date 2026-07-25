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
│       │   ├── analysis-hud.ts         # Polaroid photo with RGB glitch + scanner (LECTURA)
│       │   ├── lectura-reveal.ts       # White circle shrink shader (CONGELADO→LECTURA)
│       │   ├── lectura-text.ts         # Typing messages below photo (removed from flow)
│       │   ├── lectura-thinking.ts     # Black console box with spinner + description
│       │   ├── text-fragments.ts       # 150 floating word sprites (5 depths)
│       │   └── debug-text.ts           # Debug overlay
│       ├── shaders/
│       │   ├── noise-field.frag        # Voronoi/fBm noise with palette + UI
│       │   └── noise-field.vert
│       └── tools/
│           └── extract-face-parts.cjs  # Extracted 13 face parts from head2.glb
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
| **Frontend — REPOSO state** | ✅ Working | Vite + Three.js + TypeScript. Full-screen Voronoi noise shader, 50 floating 3D wireframe face parts, 150+ word sprites, code-typing snippets, particles, constellation lines. Camera DOM overlay with radial reveal, oval face area. Typing dialog with auto-advance, mid-text pauses (`||`), wave trigger on last text. Encuadre phase with oval guide, face tracking oval, alignment detection, bright overlay with cutout, 3-2-1 countdown, flash + capture. |
| **Frontend — LECTURA state** | ✅ Working | Circular white reveal (centered on photo), face-assembly wireframe pairs (15 pairs, opposite sides, fade-before-touch), polaroid photo with RGB glitch + scanner line, process-transparent thinking box with console spinner, structured description streaming. |
| **Ollama streaming** | ✅ Working | `ollama.js` streams `thinking_es` + `descripcion` + `prompt_en` + `prompt_es` channels. System prompt in Spanish. Model outputs structured description with `*` bullets. |
| **Photo capture (PNG)** | ✅ Working | `capture.py` saves lossless PNG at 1440×2560, base64 via WebSocket. JPEG quality removed in favor of PNG. |

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
- [x] `src/services/comfyui.js` — stub (to be implemented)
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

### 2026-07-23 — New webcam (Raptor Vision 4K) + camera mirror + UX tweaks + Gemma 4 with native thinking
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

---

## Next Steps (prioritized)

1. **Frontend animation during LECTURA** (~15s while Ollama processes) — Show dynamic visual feedback: animated thinking particles, floating text fragments, evolving word cloud from the captured photo, morphing face box, or progressive reveal animation. The photo is already shown (`photo_captured` event), and `stream_chunk` events arrive as the thinking/prompts are generated — they could be displayed with typing animation.

2. **ComfyUI bridge** — Implement `orchestrator/src/services/comfyui.js`: send photo + `prompt_en`, receive previews + final portrait.

3. **Face Swap Service** — Python WS server on port 3002 using inswapper_128 + GFPGAN.

4. **Frontend states CONGELADO+** — Implement CONGELADO, LECTURA, GENERACION, REVELACION, ESPEJO_ACTIVO, SOUVENIR, CIERRE in the frontend.

5. **Wire `stream_chunk` in frontend** — Display typing text per channel (thinking_es, prompt_en, prompt_es) during LECTURA.

6. **Wire `gen_preview` / `final_portrait` in frontend** — Show generation previews and final portrait.

7. **Souvenir + mail service** — QR, mini-page, email sending.

---

## Pending: Native Thinking / Reasoning
- **Files changed:**
  - `orchestrator/src/services/ollama.js` — Full streaming implementation with delimiters + `think` parameter support.
  - `orchestrator/src/index.js` — Ollama wired into LECTURA state.
  - `orchestrator/src/ws/uiServer.js` — `capture_photo` guard for DESPERTAR→CAPTURA.
  - `vision-service/src/detector.py` — Presence hysteresis with separate absence counter.
  - `frontend/src/main.ts` — Landscape→portrait crop in camera drawImage.
  - `vision-service/src/vision_server.py` — `CAMERA_ROTATION = None` for built-in webcam.
  - `tools/make_modelfile.py` — Script to generate Ollama Modelfile.

---

## Pending: Native Thinking / Reasoning

The `thinking_es` channel is meant to show the model's internal reasoning to the user. Three approaches identified:

1. **Ollama `think` parameter** (preferred) — Ollama API supports `think: true` returning a separate `thinking` field. Requires model-level support. `Qwen3.6:27b` (27.8B, 17GB) has both `vision` + `thinking` tags on Ollama library, making it a candidate. Also check if `qwen3.6` has smaller variants with both features.

2. **`[THINKING_ES]` as generated content** — Ask the model via system prompt to output reasoning as a delimited section before the prompts. Works with any model but is "faked" (generated text, not actual reasoning trace).

3. **Direct `llama-cpp-python`** — Run Qwen3-VL directly with `llama-cpp-python` (bypassing Ollama) for full control over the inference pipeline, potentially enabling access to internal reasoning tokens. Requires investigation.

---

## Next Steps

1. **Resolve native thinking approach** — Choose among the three options above.
2. **ComfyUI bridge** — Implement `orchestrator/src/services/comfyui.js`: send photo + `prompt_en`, receive previews + final portrait. Requires defining the ComfyUI workflow (Z-Image Turbo + ControlNet).
3. **Face Swap Service** — Python WS server on port 3002 using inswapper_128 + GFPGAN.
4. **Frontend states** — Implement CONGELADO, LECTURA, GENERACION, REVELACION, ESPEJO_ACTIVO, SOUVENIR, CIERRE in the frontend.
5. **Wire `stream_chunk` in frontend** — Display typing text per channel.
6. **Wire `gen_preview` / `final_portrait` in frontend** — Show generation previews and final portrait.
7. **Souvenir + mail service** — QR, mini-page, email sending.
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
