# El Espejo — Frontend: Especificación Estética y Técnica

> Documento de referencia para guiar el desarrollo del frontend. Combina decisiones estéticas y técnicas tomadas hasta ahora. Estado: en construcción — solo el estado de REPOSO está completamente especificado; el resto son placeholders a completar.

---

## 1. Contexto del proyecto

"El Espejo" es una instalación de galería interactiva: una pantalla vertical funciona como un "espejo mágico" con una webcam montada. Los visitantes activan la experiencia con un gesto de onda; el sistema captura su rostro, genera un retrato con IA (ComfyUI: Z-Image Turbo + ControlNet Union), y hace face swap en tiempo real para que el visitante vea sus propios gestos reflejados con el rostro generado. Al final, recibe un souvenir vía QR (imágenes, prompts, y un link a un manifiesto conceptual).

**Núcleo conceptual:** cómo los modelos de visión de IA codifican y reproducen sesgo — en particular el "doble borramiento" donde el entrenamiento de seguridad suprime la categorización explícita en el lenguaje, mientras la generación de imagen igual actúa por promediado estadístico hacia estándares de belleza homogéneos. Anclas teóricas: Haraway (god trick, situated knowledges), Lacan (estadio del espejo, méconnaissance), Baudrillard (simulacro, hiperrealidad), Freud/Rank (unheimlich, el doble), Borges.

**Principios de diseño transversales (aplican a todo el frontend, no solo a un estado):**

- **Méconnaissance como restricción de diseño:** el retrato generado debe ser lo suficientemente fiel para que el visitante se sienta reconocido, pero lo suficientemente distorsionado para producir incomodidad uncanny.
- **Resistir la lectura de "filtro de Instagram":** se logra con latencia intencional, motion capture incompleto, finales abruptos, ausencia de señales de interfaz que remitan a entretenimiento/redes sociales.
- **Transparencia autoral:** el proyecto no quiere replicar la estructura de poder invisible que critica — de ahí que se muestre el razonamiento del modelo y la traducción en vez de esconderlos.
- **El glitch como falla visible, no decoración:** cuando aparece, tiene que significar algo (el sistema reaccionando/rompiéndose ante un cuerpo real), no ser un filtro estético aplicado parejo.
- **Política bilingüe:** el LLM piensa en español, genera el prompt de imagen en inglés (mejor adherencia con el text encoder), y traduce — las tres salidas se muestran. Esta misma política se refleja en el frontend: términos técnicos tienden a aparecer en inglés (fieles al prompt real), términos teóricos/poéticos tienen mayor presencia en español, y en general el español predomina porque el resto de la interfaz está en español.
- **Unidad estética:** todos los elementos de interfaz (cajas de texto, bounding boxes, óvalos, HUD) comparten el mismo lenguaje visual: borde blanco de 1px con 3 ghosts RGB (rojo, verde, azul) en `position:absolute; inset:-1px` con glitch dinámico aleatorio. Tipografía única: `Consolas, "Courier New", monospace` en todos los tamaños, sin variantes bold ni fuentes externas.

---

## 2. Stack técnico (implementado)

- **Vite** como bundler/dev server — sin framework de componentes (no React/Vue).
- **TypeScript** — tipado estricto.
- **Three.js** — versión 0.170.0. Se eligió sobre OGL por su ecosistema de cargadores (GLTFLoader, etc.) necesario para los modelos 3D de fragmentos de rostro.
- **WebSocket nativo del browser** — `WsClient` en `websocket-client.ts` para conectar con el Orchestrator (puerto 3000).
- **Sin GSAP, sin Canvas 2D nativo** — toda la capa visual corre en WebGL/Three.js. Los textos son `Sprite` objects con `CanvasTexture` generada proceduralmente. La animación es enteramente en el loop de `requestAnimationFrame`.

**Estructura de carpetas implementada:**

```
frontend/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── public/
│   └── models/
│       ├── head.glb                    # Modelo de cabeza completo (descargado)
│       ├── head2.glb                   # Segundo modelo (fuente para extracción)
│       └── face-parts/                 # 13 wireframes extraídos (ver tools/)
│           ├── left-eye.glb, right-eye.glb, nose.glb, mouth.glb ...
│           ├── jaw.glb, brow.glb, left-cheek.glb, right-cheek.glb
│           ├── upper-face.glb, lower-face.glb
│           ├── left-half.glb, right-half.glb, full-head.glb
└── src/
    ├── main.ts                         # Entry point: scene setup + REPOSO layers
    ├── state-machine.ts                # FrontendStateMachine (todos los estados)
    ├── websocket-client.ts             # WsClient → Orchestrator (puerto 3000)
    ├── data/
    │   └── word-bank.ts                # ~150 palabras categorizadas
    ├── layers/
    │   ├── idle-field.ts               # Full-screen ShaderMaterial (Voronoi noise + box)
    │   ├── sphere-shader.ts            # Esfera Voronoi semitransparente (WIP)
    │   ├── face-fragments.ts           # 50 instancias de wireframes 3D flotantes
    │   ├── face-tracker.ts             # FaceTracker con mock mode + interpolación
    │   ├── text-fragments.ts           # 150 sprites de palabras en 5 capas de profundidad
    │   └── debug-text.ts               # Superposición de debug
    ├── data/
    │   ├── word-bank.ts               # ~150 palabras categorizadas
    │   └── dialogs.ts                 # Textos del diálogo interactivo
    ├── shaders/
    │   ├── noise-field.frag            # Voronoi 3D + fBm + paleta + brackets + glitch
    │   └── noise-field.vert
    └── tools/
        └── extract-face-parts.cjs      # Script Node.js que extrae 13 regiones faciales de head2.glb
```

---

## 3. Paleta general (transversal)

**Decisión confirmada:** hay una identidad visual coherente a lo largo de toda la pieza — no se cambia de estética entre estados. La base es negro profundo, violeta índigo, cian, magenta, con acentos verde ácido y ámbar puntuales.

Los distintos estados se diferencian por **variaciones dentro de ese mismo lenguaje** — no por saltos de paleta. Variables disponibles para marcar un "momento" distinto sin romper coherencia:

- **Intensidad/densidad:** más disperso y calmo (reposo) vs. más denso y saturado (momentos de mayor tensión).
- **Velocidad y amplitud de movimiento:** drift lento vs. movimiento más agitado.
- **Frecuencia e intensidad del glitch/RGB-split:** baseline sutil vs. spikes más frecuentes/fuertes.
- **Balance de color dentro de la misma paleta:** por ejemplo, más presencia de un acento sobre otro en un momento puntual, sin salir del set de colores definido.

Cualquier variación de este tipo entre estados queda pendiente de definir puntualmente estado por estado — pero siempre dentro de esta identidad única, no como paletas alternativas.

---

## 4. Estado: REPOSO (completamente especificado)

### 4.1 Concepto

Es el estado de "espacio de potencialidad" — todos los rostros posibles superpuestos, sin colapsar en uno. Metáfora de superposición antes de que el gesto de la persona "colapse" el espacio latente en un rostro específico. Es el "ojo que todo lo ve" (Haraway) en su estado más puro, antes de posarse sobre un cuerpo particular.

### 4.2 Referencias visuales generadas (para continuidad)

Dos prompts probados en Firefly/nano banana 2 (formato 1080x1920, full screen vertical):

**v1** — primera aproximación, resultó "demasiado básica/limpia": formas wireframe de rostro flotando sobre negro, palabras dispersas, bounding box de tracking. Le faltaba textura, glitch, densidad y un elemento de "marco/portal".

**v2** — versión corregida, agrega: grano/ruido analógico pesado, chromatic aberration/RGB split fuerte, marco central tipo portal con distorsión de lente, fragmentos de wireframe más reconociblemente anatómicos (mandíbula, cuenca de ojo, pómulo), datamosh en los bordes, chispas ámbar como acento cálido contra la paleta fría.

**Imagen de referencia base (aprobada):** composición densa de fragmentos de malla de rostro en verde/magenta/cian sobre fondo tipo circuito, con palabras parcialmente corrompidas ("tyanoise", "raxtreed") — este accidente de generación es un hallazgo a replicar intencionalmente en el render de texto real (texto que se corrompe/vuelve parcialmente ilegible, no solo blur limpio).

**Nota de densidad:** esa imagen de referencia representa el **pico de disturbance** (máxima densidad/glitch, cuando el campo está siendo perturbado cerca del punto de detección), no el estado idle puro. El idle puro debe ser más disperso, más calmo, con más espacio negativo.

### 4.3 Capas implementadas (escena 3D con cámara en el origen, no un único pass WebGL plano)

A diferencia de lo planeado originalmente (un único render pass de WebGL), la implementación final usa **múltiples objetos Three.js en una escena 3D** con cámara perspectiva en el origen mirando hacia afuera. Esto crea la sensación de estar *dentro* del espacio latente. Todas las capas se renderizan en el mismo loop pero como meshes/sprites separados con sus propios `renderOrder`.

1. **Campo de shader base** (`idle-field.ts`): `ShaderMaterial` sobre un `PlaneGeometry(2,2)` full-screen. Voronoi 3D noise con fBm (simplex 3D), paleta negro/índigo/cian/magenta, scan lines, film grain, viñeta, corner brackets para el bounding box, drift cromático, niebla de profundidad. Las coordenadas del box y el nivel de disturbance se pasan como uniforms desde el `FaceTracker`.
2. **Fragmentos wireframe de rostro** (`face-fragments.ts`): 50 instancias de 13 wireframes 3D extraídos de `head2.glb` mediante `tools/extract-face-parts.cjs`. Cada fragmento tiene un lifecycle rise/fall (aparece, flota, se desvanece, respawnea en otra posición). Tienen un "ghost" RGB que hace glitch periódico (un canal de color se desplaza brevemente). Flotan en diferentes profundidades (z: -0.2 a -9) con rotación lenta.
3. **Fragmentos de texto** (`text-fragments.ts`): 150 sprites en 5 bandas de profundidad (far: z=-6 a near: z=6) con blur progresivo (0-12px), opacidad variable, deriva lateral lenta, oscilación en Z, y repulsión desde la posición del face box. Renderizados como `Sprite` objects con `CanvasTexture` generada proceduralmente.
4. **Palabras flotantes** (en `main.ts`): 120 sprites de palabras sampleadas del word bank, con colores grises variables, blur aleatorio, deriva senoidal, y lifecycle de opacidad. Se mueven en un volumen esférico alrededor de la cámara.
5. **Snippets de código** (en `main.ts`): 4 líneas de terminal que se tipean solas en tiempo real (efecto de máquina de escribir), mostrando mensajes de inferencia: `denoising... confidence: 0.87`, `estimating latent... step 4/50`, etc.
6. **Snippets de bias** (en `main.ts`): 8 líneas que muestran clasificaciones del sistema de visión en tono acusatorio: `mujer, 28-35 años, tez clara`, `belleza: estándar occidental | 0.92`. Se tipean con glow púrpura borroso.
7. **Partículas de profundidad**: 400 + 300 puntos en 2 capas (gris y teal tenue) con blending aditivo, creando atmósfera de profundidad.
8. **Líneas constelación**: conexiones entre partículas cercanas (< 0.8 unidades) formando una red tenue.
9. **Nebulosa**: plano semitransparente con ruido senoidal en z=-4, púrpura muy tenue.
10. **Grid infinito**: líneas de grid en z=-6 con opacidad 0.04, azul oscuro.
11. **Light bursts**: 6 destellos radiales que aparecen cíclicamente con blending aditivo.
12. **Bounding box de tracking DOM** (en `main.ts`): overlay de div con borde blanco + 3 ghosts RGB con offset, posicionados fixed (z-index:999), clamp al viewport.
13. **Camera feed DOM overlay** (en `main.ts`): canvas fixed (z-index:500) que muestra el feed de cámara con revelado radial desde la cara, 10% de opacidad general y 100% en el área del rostro (2x).
14. **Diálogo con máquina de escribir** (en `main.ts`): div fixed (z-index:1000) debajo del bounding box, fuente Consolas 26px, texto de `src/data/dialogs.ts`, avance por gesto de saludo.
15. **Hint de interacción** (en `main.ts`): div fixed (z-index:1000) debajo del diálogo, texto 16px Consolas con icono SVG de mano (Phosphor), feedback verde "saludo detectado" al recibir wave.

### 4.4 Comportamiento e interacción implementado

- **Sin presencia detectada:** las capas 1-11 en loop lento. El shader corre con `uBoxSize = 0` (sin brackets visibles). Disturbance en 0.
- **Presencia detectada (real, vía WebSocket):** el `WsClient` recibe eventos `face_tracking` y `presence` del Orchestrator. El `FaceTracker.updateFromDetection()` recibe coordenadas reales. El shader recibe `uBoxPos`, `uBoxSize`, `uDisturbance`. Los brackets se activan.
- **Camera feed como DOM overlay:** cuando hay presencia, la cámara se muestra como un canvas posicionado fixed (z-index:500) sobre la escena Three.js. La imagen se revela radialmente desde la posición del rostro (CSS `mask-image` con radial-gradient animado). El área del rostro se renderiza a 100% de opacidad (2x más grande que la detección de MediaPipe); el resto del frame a ~10%. Transiciones suaves de fade in/out (lerp 2.0/s al entrar, 2.5/s al salir).
- **Bounding box DOM:** overlay de div con borde blanco + 3 divs ghost RGB (rojo, verde, azul) con offset tipo chromatic aberration, posicionados fixed (z-index:999). Se clampan al viewport para no cortarse en los bordes.
- **Diálogo con efecto de máquina de escribir:** cuando se detecta presencia, aparece un texto debajo del bounding box que se tipea letra por letra (fuente Consolas 26px, max-width 600px). El texto se obtiene de `src/data/dialogs.ts` en orden secuencial.
- **Control por gesto de saludo (wave):** cada vez que el usuario saluda con la mano:
  - Si el texto está tipeando → se completa instantáneamente
  - Si ya terminó → avanza al siguiente texto del array
  - Después del último texto → el frontend envía `{ type: 'continue' }` al Orchestrator, que transiciona DESPERTAR → CAPTURA
- **Hint de interacción:** debajo del diálogo, un texto más chico (16px Consolas) con un icono SVG inline de mano saludando (Phosphor hand-waving) guía al usuario: `saluda con la mano para continuar`. Cuando se detecta un saludo, el hint se pone verde (`#4ade80` con glow) y dice `saludo detectado` por 1.5 segundos.
- **Posicionamiento inteligente:** tanto el bounding box como el diálogo se clampan al viewport. Si no hay espacio debajo del box, el diálogo se muestra arriba. La posición del hint se calcula estimando las líneas de texto envueltas.
- **Repulsión:** implementada en `text-fragments.ts` — los sprites cercanos al box position se desplazan lateralmente. Implementación en espacio JS (no en shader) por simplicidad. Los elementos lejos mantienen su deriva base.
- **Glitch/RGB-split:** implementado a dos niveles:
  - En el shader: el drift cromático se intensifica con `uDisturbance`.
  - En los face fragments: el "ghost" de cada wireframe cambia de color (RGB channels) y se desplaza brevemente, con timer individual por fragmento.
- **Cámara:** respira suavemente con movimiento senoidal en x/y/z (amplitud ~0.06) y rota la mirada lentamente. Crea sensación de flotación orgánica.
- **Conexión real vs mock:** el `WsClient` se conecta al Orchestrator (localhost:3000). Las coordenadas reales del face tracking alimentan `FaceTracker.updateFromDetection()`. El modo mock sigue disponible para desarrollo.

### 4.5 Banco de palabras (implementado)

El banco se implementó en `src/data/word-bank.ts` con ~150 entradas categorizadas y bilingües. El `WORD_BANK` exporta funciones `getRandomWord()` y `getWordsByCategory()`.

**Categorías implementadas:**
- `tecnico` (en + es): términos del pipeline de generación — skin, latent, seed, mask, denoise, sampler, tensor, pixel...
- `estandar` (es): estándares de belleza — belleza, estándar, promedio, ideal, canon, sesgo, desvío...
- `teorico` (es): aparato conceptual — mirada, espejo, reflejo, doble, siniestro, simulacro, hiperreal...
- `vigilancia` (es): el sistema mirando — escanear, rastrear, capturar, sensor, lente, error, falla...
- `poetico` (es): ~60 entradas poéticas/ambiguas — quién, deviniendo, umbral, casi, todavía no, eco, rastro, residuo, memoria, fui, soy, seré, flotar, disolver, fragmento, abismo, velo, neblina, latencia, pulso, frecuencia, origen, caos...

Además del banco principal, hay dos conjuntos de textos dinámicos generados en `main.ts`:
- **Code snippets**: 15 líneas que simulan output de terminal de ML (`denoising... confidence: 0.87`, `CFG scale: 7.0 | steps: 28/50`...). Se tipean letra por letra.
- **Bias snippets**: 15 líneas que muestran clasificaciones del sistema (`mujer, 28-35 años, tez clara`, `belleza: estándar occidental | 0.92`...), con glow púrpura.

El criterio bilingüe del diseño se mantiene: términos técnicos del pipeline en inglés, términos conceptuales/poéticos en español, español predominante en el resto.

### 4.6 Notas técnicas (decisiones implementadas)

- **Renderizado:** la escena usa múltiples objetos Three.js (no un único pass WebGL). Cada capa es un mesh/sprite independiente con su propio `renderOrder`. Esto funciona porque Three.js ordena el renderizado por orden de inserción (no hay z-buffer entre sprites transparentes). La cámara está en el origen con perspectiva 65°, mirando hacia el espacio negativo de Z.
- **Uniforms del shader (`idle-field.ts`):** `uTime`, `uResolution`, `uBoxPos`, `uBoxSize`, `uDisturbance`. Se actualizan desde el `FaceTracker` en cada frame.
- **Wireframes 3D:** se extrajeron de un modelo GLB (`head2.glb`) mediante un script Node.js (`tools/extract-face-parts.cjs`) que divide la malla en 13 regiones faciales por bounding box espacial. Esto reemplazó la idea original de loops de video pre-renderizados — resultó en mayor fidelidad geométrica y control en tiempo real.
- **Textos:** son `THREE.Sprite` objects con `CanvasTexture` generada proceduralmente. No usan DOM/CSS. El blur se aplica como filtro CSS en el canvas 2D antes de subir la textura a la GPU. La corrupción intencional de texto (accidente de la imagen de referencia) está pendiente de implementar.
- **Anti-aliasing desactivado** intencionalmente (`antialias: false`) y pixel ratio clamp a 1.0 para estética lo-fi/digital cruda.
- **Resolución objetivo:** 1080×1920 (retrato). El renderer ajusta el viewport para mantener el aspect ratio con letterboxing.
- **Face tracker:** el `FaceTracker` tiene modo mock (`mockPresent()` con movimiento senoidal suave) para desarrollo. El método `updateFromDetection(pos, size)` está listo para recibir coordenadas reales desde el WebSocket. La interpolación usa `lerp` con factor derivado de `1 - exp(-8 * dt)`.
- **El sphere-shader.ts** (esfera Voronoi semitransparente) se creó pero no se agregó a la escena — queda como WIP para cuando tenga sentido conceptual (probablemente en DESPERTAR o CAPTURA).

### 4.7 Decisiones pendientes de este estado

- Transición de colapso: no implementada — el frontend state machine existe pero no está conectado a la escena.
- Texto corrompido intencionalmente: pendiente de implementar (desplazamiento de franjas horizontales en el canvas de texto para replicar el accidente de la imagen de referencia).
- Mejorar la sensibilidad / experiencia del gesto de wave: el cooldown se redujo de 90 a 10 frames (~18s → 2s), pero aún hay que iterar la UX de avance de diálogo.

---

## 5. Estados pendientes de implementar

Los siguientes estados del flujo (definidos conceptualmente en `espejo-ux-flow.md`) todavía no tienen implementación ni especificación cerrada:

- **Transición REPOSO → DESPERTAR** — el "colapso" del campo al detectar presencia sostenida. Pendiente: diseñar la animación de transición (el box crece, el shader se disuelve). Requiere conectar el frontend state machine a la escena.
- **Gesto de onda** — ¿respuesta inmediata o latencia deliberada? Pendiente de diseñar.
- **Captura** — ¿corte abrupto tipo flash o disolución gradual? Pendiente de diseñar.
- **Congelado / Lectura** — mostrar la foto capturada + mensajes del sistema. Pendiente de diseñar.
- **Generación** — mostrar el streaming del LLM (texto bilingüe apareciendo) + previews de ComfyUI. Pendiente de diseñar.
- **Face swap en vivo** — momento de mayor tensión conceptual (pico de méconnaissance). Pendiente de diseñar.
- **QR / souvenir** — retorno a calma, cierre. Pendiente de diseñar.

---

## 6. Notas para quien implemente (actualizado)

- El REPOSO state requiere el pipeline completo (Vision Service → Orchestrator → Frontend) para la cámara en vivo y detección. Corre con `npm run dev` en el folder `frontend/`.
- El frontend usa Three.js 0.170.0 con TypeScript. Los loaders de GLTF se importan desde `three/addons/`.
- Los 13 modelos de face-parts se extrajeron de `head2.glb` con `tools/extract-face-parts.cjs`. Si se necesita regenerarlos: `node tools/extract-face-parts.cjs`.
- La escena usa `renderOrder` para el orden de capas. No confiar en z-buffer para sprites transparentes.
- El shader de ruido Voronoi está en `src/shaders/noise-field.frag` como archivo separado, no embebido en el .ts.
- El `FaceTracker` recibe coordenadas reales del Orchestrator vía `WsClient`. El modo mock sigue disponible para desarrollo.
- El frontend se conecta al Orchestrator (puerto 3000), no directo al Vision Service. Ver `websocket-client.ts`.
- El overlay de cámara es un canvas DOM (no Three.js) para evitar problemas de composición con shaders transparentes.
- El diálogo interactivo se controla por gesto de saludo (wave). Los textos se editan en `src/data/dialogs.ts`.
- Consultar `espejo-ux-flow.md` y `espejo-arquitectura-tecnica.md` para los contratos de mensajes WebSocket exactos y el mapa de estados completo.
