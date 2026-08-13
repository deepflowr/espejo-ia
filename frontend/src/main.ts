/**
 * El Espejo — Frontend Entry Point
 *
 * REPOSO state: immersed inside the latent space.
 * Full-screen 3D perspective with floating text, face fragments,
 * and the Voronoi noise field covering everything.
 * The camera breathes slowly — you're inside the crystal ball.
 */

import * as THREE from 'three';
import { createIdleFieldMesh, createUniforms } from './layers/idle-field';
import { createFaceFragments } from './layers/face-fragments';
import { WORD_BANK } from './data/word-bank';
import { FaceTracker } from './layers/face-tracker';
import { WsClient } from './websocket-client';
import { WELCOME_TEXT, WELCOME_HINT, WAVE_SVG, CHECK_SVG } from './data/dialogs';
import { createRevealMesh } from './layers/lectura-reveal';
import { createFaceAssembly } from './layers/face-assembly';
import { createAnalysisHUD } from './layers/analysis-hud';
import { createLecturaThinking } from './layers/lectura-thinking';
import { createPromptBox } from './layers/prompt-box';

const _white = new THREE.Color(1.0, 1.0, 1.0);
const _glitchRGB = [
  new THREE.Color(1.0, 0.0, 0.0),
  new THREE.Color(0.0, 1.0, 0.0),
  new THREE.Color(0.0, 0.0, 1.0),
];

// ─── Scene setup ──────────────────────────────────────────────
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(65, 1080 / 1920, 0.1, 20);
camera.position.set(0, 0, 0);

const renderer = new THREE.WebGLRenderer({
  antialias: false,
  alpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
document.body.appendChild(renderer.domElement);

// ─── Uniforms ─────────────────────────────────────────────────
const uniforms = createUniforms();

// ─── Idle field shader (full-screen, like before) ─────────────
const idleField = createIdleFieldMesh(uniforms);
idleField.renderOrder = 0;
scene.add(idleField);

// ─── DOM-based corner brackets (guaranteed on top, any thickness) ─
const boxContainer = document.createElement('div');
boxContainer.id = 'face-box-container';
boxContainer.style.cssText = 'position:fixed;pointer-events:none;z-index:999;display:none';
const boxEl = document.createElement('div');
boxEl.id = 'face-box';
boxEl.style.cssText = 'position:relative;width:100%;height:100%;border:1px solid rgba(255,255,255,0.35);border-radius:0;box-shadow:0 0 12px rgba(255,255,255,0.15),inset 0 0 12px rgba(255,255,255,0.05)';
boxContainer.appendChild(boxEl);
// RGB glitch ghosts — absolute inside container (same as prompt box style)
const boxGhosts = ['#ff0000','#00ff00','#0000ff'].map((color) => {
  const g = document.createElement('div');
  g.style.cssText = `position:absolute;top:-1px;left:-1px;right:-1px;bottom:-1px;border:1px solid ${color};pointer-events:none;opacity:0.25;mix-blend-mode:screen`;
  boxContainer.appendChild(g);
  return g;
});
document.body.appendChild(boxContainer);

// ─── Camera feed as DOM overlay (viewport-aligned) ────────────
let pendingFrame: HTMLImageElement | null = null;
let lastFrameImg: HTMLImageElement | null = null;
let revealProgress = 0;
const camCanvas = document.createElement('canvas');
camCanvas.id = 'camera-feed';
camCanvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:500;opacity:0;transition:opacity 0.5s ease;-webkit-transform:scaleX(-1);transform:scaleX(-1)';
document.body.appendChild(camCanvas);
const camCtx = camCanvas.getContext('2d')!;
camCanvas.width = window.innerWidth;
camCanvas.height = window.innerHeight;

// ─── Text sprites — floating in 3D space ──────────────────────
const wordList = WORD_BANK.map(w => w.text);

function makeTextTexture(text: string, blurPx: number, colorIdx: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  ctx.font = '32px Consolas, "Courier New", monospace';
  const metrics = ctx.measureText(text.toUpperCase());
  const textW = Math.max(metrics.width + 20, 64);
  const textH = 48;
  c.width = textW;
  c.height = textH;

  ctx.clearRect(0, 0, textW, textH);
  ctx.font = '32px Consolas, "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const colors = [
    'rgba(180, 180, 180, 0.6)',
    'rgba(140, 140, 140, 0.55)',
    'rgba(200, 200, 200, 0.6)',
    'rgba(120, 120, 120, 0.55)',
    'rgba(160, 160, 160, 0.6)',
    'rgba(100, 100, 100, 0.55)',
    'rgba(220, 220, 220, 0.6)',
    'rgba(150, 150, 150, 0.55)',
    'rgba(190, 190, 190, 0.6)',
    'rgba(130, 130, 130, 0.55)',
  ];
  const col = colors[colorIdx % colors.length];

  ctx.shadowColor = 'rgba(10, 8, 15, 0.15)';
  ctx.shadowBlur = 4;
  ctx.fillStyle = col;

  ctx.filter = `blur(${blurPx}px)`;
  ctx.fillText(text.toUpperCase(), textW / 2, textH / 2);

  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

interface WordSprite {
  sprite: THREE.Sprite;
  basePos: THREE.Vector3;
  velocity: THREE.Vector3;
  phase: number;
  life: number;
  lifeSpeed: number;
  state: 'rising' | 'falling';
  glitchTimer: number;
  glitchOffset: THREE.Vector3;
}

const wordSprites: WordSprite[] = [];
const WORD_COUNT = 120;

for (let i = 0; i < WORD_COUNT; i++) {
  const text = wordList[Math.floor(Math.random() * wordList.length)];
  const colorIdx = Math.floor(Math.random() * 10);
  const blurPx = Math.floor(Math.random() * 4);
  const tex = makeTextTexture(text, blurPx, colorIdx);

  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);

  // Full frustum coverage — reaches all edges
  const zDepth = -0.2 - Math.random() * 10;
  const spread = -zDepth * (0.3 + Math.random() * 1.0);
  const angle = Math.random() * Math.PI * 2;

  sprite.position.set(
    Math.cos(angle) * spread,
    Math.sin(angle) * spread * 0.7,
    zDepth,
  );

  const s = 0.04 + Math.random() * 0.15;
  sprite.scale.set(s, s * 0.2, 1);

  scene.add(sprite);

  wordSprites.push({
    sprite,
    basePos: sprite.position.clone(),
    velocity: new THREE.Vector3(
      (Math.random() - 0.5) * 0.0004,
      (Math.random() - 0.5) * 0.0004,
      (Math.random() - 0.5) * 0.0003,
    ),
    phase: Math.random() * Math.PI * 2,
    life: Math.random(),
    lifeSpeed: 0.002 + Math.random() * 0.003,
    state: 'rising',
    glitchTimer: Math.random() * 10,
    glitchOffset: new THREE.Vector3(),
  });
}

// ─── Floating particles — depth atmosphere ────────────────────
const particleCount = 400;
const particleGeo = new THREE.BufferGeometry();
const particlePos = new Float32Array(particleCount * 3);
const particleSizes = new Float32Array(particleCount);

for (let i = 0; i < particleCount; i++) {
  const zDepth = -0.5 - Math.random() * 10;
  const spread = -zDepth * (0.1 + Math.random() * 1.0);
  const angle = Math.random() * Math.PI * 2;
  particlePos[i * 3] = Math.cos(angle) * spread;
  particlePos[i * 3 + 1] = Math.sin(angle) * spread * 0.9;
  particlePos[i * 3 + 2] = zDepth;
  particleSizes[i] = 0.002 + Math.random() * 0.008;
}

particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
particleGeo.setAttribute('size', new THREE.BufferAttribute(particleSizes, 1));

const particleMat = new THREE.PointsMaterial({
  color: 0x888888,
  size: 0.008,
  transparent: true,
  opacity: 0.4,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const particles = new THREE.Points(particleGeo, particleMat);
particles.renderOrder = 1;
scene.add(particles);

// ─── Second particles — teal/cyan, tiny ───────────────────────
const particleCount2 = 300;
const pGeo2 = new THREE.BufferGeometry();
const pPos2 = new Float32Array(particleCount2 * 3);
for (let i = 0; i < particleCount2; i++) {
  const zDepth = -0.3 - Math.random() * 12;
  const spread = -zDepth * (0.05 + Math.random() * 0.8);
  const angle = Math.random() * Math.PI * 2;
  pPos2[i * 3] = Math.cos(angle) * spread;
  pPos2[i * 3 + 1] = Math.sin(angle) * spread * 0.8;
  pPos2[i * 3 + 2] = zDepth;
}
pGeo2.setAttribute('position', new THREE.BufferAttribute(pPos2, 3));
const pMat2 = new THREE.PointsMaterial({
  color: 0x666666,
  size: 0.004,
  transparent: true,
  opacity: 0.25,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const particles2 = new THREE.Points(pGeo2, pMat2);
particles2.renderOrder = 1;
scene.add(particles2);

// ─── Nebula — single purple cloud layer ───────────────────────
const nebulaVert = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const nebulaFrag = `precision highp float; uniform float uTime; varying vec2 vUv;
void main() {
  float t = uTime * 0.003;
  float n1 = sin(vUv.x * 3.0 + t) * cos(vUv.y * 2.5 + t * 0.5) * 0.5 + 0.5;
  float n2 = sin(vUv.x * 5.0 - t * 0.3 + vUv.y * 3.0) * 0.5 + 0.5;
  float a = (n1 * 0.5 + n2 * 0.3) * 0.35;
  vec3 col = mix(vec3(0.04, 0.04, 0.04), vec3(0.02, 0.02, 0.02), n1);
  gl_FragColor = vec4(col, a);
}`;
const nebulaMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 } },
  vertexShader: nebulaVert,
  fragmentShader: nebulaFrag,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
});
const nebulaMesh = new THREE.Mesh(new THREE.PlaneGeometry(16, 20), nebulaMat);
nebulaMesh.position.set(0, 0, -4);
scene.add(nebulaMesh);
const nebulaUniformsList = [nebulaMat.uniforms];

// ─── Infinite grid ────────────────────────────────────────────
const gridLines = 30;
const gridSpread = 4;
const gridPositions: number[] = [];
for (let i = -gridLines; i <= gridLines; i++) {
  const t = i / gridLines;
  // Horizontal lines
  gridPositions.push(-gridSpread, t * gridSpread, -6, gridSpread, t * gridSpread, -6);
  // Vertical lines
  gridPositions.push(t * gridSpread, -gridSpread, -6, t * gridSpread, gridSpread, -6);
}
const gridGeo = new THREE.BufferGeometry();
gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPositions, 3));
const gridMat = new THREE.LineBasicMaterial({
  color: 0x223355,
  transparent: true,
  opacity: 0.04,
  depthWrite: false,
});
const gridMesh = new THREE.LineSegments(gridGeo, gridMat);
gridMesh.renderOrder = 1;
scene.add(gridMesh);

// ─── Data flickers ────────────────────────────────────────────
const flickerCount = 80;
const flickerPos = new Float32Array(flickerCount * 3);
const flickerPhase = new Float32Array(flickerCount);
const flickerSpeed = new Float32Array(flickerCount);
for (let i = 0; i < flickerCount; i++) {
  const zDepth = -0.5 - Math.random() * 10;
  const spread = -zDepth * (0.05 + Math.random() * 0.6);
  const angle = Math.random() * Math.PI * 2;
  flickerPos[i * 3] = Math.cos(angle) * spread;
  flickerPos[i * 3 + 1] = Math.sin(angle) * spread * 0.8;
  flickerPos[i * 3 + 2] = zDepth;
  flickerPhase[i] = Math.random() * Math.PI * 2;
  flickerSpeed[i] = 0.5 + Math.random() * 2.0;
}
const fGeo = new THREE.BufferGeometry();
fGeo.setAttribute('position', new THREE.BufferAttribute(flickerPos, 3));
const fMat = new THREE.PointsMaterial({
  color: 0x999999,
  size: 0.005,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const flickerPoints = new THREE.Points(fGeo, fMat);
flickerPoints.renderOrder = 2;
scene.add(flickerPoints);

// ─── Denoise code snippets — typed in real-time ───────────────
const codeLines = [
  'denoising... confidence: 0.87',
  'estimating latent... step 4/50',
  'mask: face_01 | reconstructing',
  'noise_scale: 0.042 | variance: 0.13',
  'inpaint boundary: 12px | blend: 0.7',
  'tensor[512x512] :: inference 23ms',
  'sampling... eta: 0.0 | guidance: 7.5',
  'embedding match: 0.94 | keypoint 47',
  'token: "piel" | weight: 1.2',
  'denoise iteration: 12 | residual: 0.03',
  'UNet encoder | skip: 3 | scale: 8x',
  'attention mask: eyes | strength: 0.8',
  'V AE decode: 512x512 | latent: 64x64',
  'CFG scale: 7.0 | steps: 28/50',
  'cross-attention: "textura" → map',
];

interface CodeSnippet {
  group: THREE.Group;
  sprite: THREE.Sprite;
  ghost: THREE.Sprite;
  fullText: string;
  visibleChars: number;
  charSpeed: number;
  life: number;
  state: 'typing' | 'display' | 'fading';
  basePos: THREE.Vector3;
  phase: number;
  isBias: boolean;
  ghostGlitch: number;
}

const codeSnippets: CodeSnippet[] = [];
const CODE_COUNT = 4;

// Pre-create canvases for text size measurement
function makeCodeTexture(text: string, progress: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  c.width = 800;
  c.height = 64;

  ctx.clearRect(0, 0, 800, 64);
  ctx.font = '20px Consolas, "Courier New", monospace';
  ctx.textBaseline = 'middle';

  const visibleLen = Math.floor(text.length * progress);
  const displayText = text.slice(0, visibleLen);

  ctx.fillStyle = 'rgba(180, 180, 180, 0.7)';
  ctx.fillText('> ', 12, 32);
  ctx.fillStyle = 'rgba(200, 200, 200, 0.6)';
  ctx.fillText(displayText, 60, 32);

  // Blinking cursor at end
  if (progress < 1) {
    ctx.fillStyle = 'rgba(220, 220, 220, 0.8)';
    ctx.fillText('_', 60 + ctx.measureText(displayText).width, 32);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

// Sprite pool — reused across snippets
const codeMat = new THREE.SpriteMaterial({
  map: makeCodeTexture('init', 0),
  transparent: true,
  depthWrite: false,
  opacity: 0,
});

for (let i = 0; i < CODE_COUNT; i++) {
  const sprite = new THREE.Sprite(codeMat.clone());
  sprite.renderOrder = 8;

  const zDepth = -0.5 - Math.random() * 6;
  const spread = -zDepth * (0.1 + Math.random() * 0.5);
  const angle = Math.random() * Math.PI * 2;
  sprite.position.set(
    Math.cos(angle) * spread,
    Math.sin(angle) * spread * 0.6,
    zDepth,
  );
  const s = 0.015 + Math.random() * 0.03;
  sprite.scale.set(s * 12, s, 1);

  // Ghost/bloom layer
  const ghostSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: (sprite.material as THREE.SpriteMaterial).map,
    transparent: true,
    depthWrite: false,
    opacity: 0,
  }));
  ghostSprite.renderOrder = 7;
  ghostSprite.scale.set(s * 13, s * 1.1, 1);
  ghostSprite.position.copy(sprite.position);
  ghostSprite.position.z += 0.01;

  const group = new THREE.Group();
  group.add(sprite);
  group.add(ghostSprite);
  group.position.copy(sprite.position);
  sprite.position.set(0, 0, 0);
  ghostSprite.position.set(0.005, 0, 0);
  scene.add(group);

  codeSnippets.push({
    group,
    sprite,
    ghost: ghostSprite,
    fullText: codeLines[Math.floor(Math.random() * codeLines.length)],
    visibleChars: 0,
    charSpeed: 0.3 + Math.random() * 0.8,
    life: Math.random(),
    state: 'typing',
    basePos: group.position.clone(),
    phase: Math.random() * Math.PI * 2,
    isBias: false,
    ghostGlitch: 0,
  });
}

// ─── Bias detection snippets — blurred purple, uncertain ─────
const biasLines = [
  'mujer, 28-35 años, tez clara',
  'expresión: neutra/triste | 0.89',
  'belleza: estándar occidental | 0.92',
  'simetría facial: alta | 0.87',
  'no coincide con el canon, error',
  'género: femenino | confianza: 0.94',
  'piel: tono claro | calibración ok',
  'edad estimada: 32 años',
  'rasgos: proporción áurea | 0.91',
  'class: femenino | score: 0.96',
  'desviación: pómulo bajo | -0.23',
  'rostro válido | belleza: 0.88',
  'medidas: dentro del estándar',
  'tipo: caucásico | confianza: 0.90',
  'evaluación: aprobado | 0.85',
];

function makeBiasTexture(text: string, progress: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  c.width = 800;
  c.height = 64;
  ctx.clearRect(0, 0, 800, 64);
  ctx.font = '20px Consolas, "Courier New", monospace';
  ctx.textBaseline = 'middle';
  const visibleLen = Math.floor(text.length * progress);
  const displayText = text.slice(0, visibleLen);
  ctx.fillStyle = 'rgba(160, 160, 160, 0.6)';
  ctx.fillText('? ', 8, 32);
  ctx.shadowColor = 'rgba(120, 30, 100, 0.3)';
  ctx.shadowBlur = 4;
  ctx.fillStyle = 'rgba(180, 180, 180, 0.6)';
  ctx.fillText(displayText, 52, 32);
  ctx.shadowBlur = 0;
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

const BIAS_COUNT = 8;
for (let i = 0; i < BIAS_COUNT; i++) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeBiasTexture('init', 0),
    transparent: true,
    depthWrite: false,
    opacity: 0,
  }));
  sprite.renderOrder = 8;
  const zDepth = -0.3 - Math.random() * 7;
  const spread = -zDepth * (0.1 + Math.random() * 0.6);
  const angle = Math.random() * Math.PI * 2;
  sprite.position.set(Math.cos(angle) * spread, Math.sin(angle) * spread * 0.7, zDepth);
  const s = 0.02 + Math.random() * 0.035;
  sprite.scale.set(s * 12, s, 1);
  const ghostSpriteB = new THREE.Sprite(new THREE.SpriteMaterial({
    map: (sprite.material as THREE.SpriteMaterial).map,
    transparent: true,
    depthWrite: false,
    opacity: 0,
  }));
  ghostSpriteB.renderOrder = 7;
  ghostSpriteB.scale.set(s * 13, s * 1.1, 1);
  const groupB = new THREE.Group();
  groupB.add(sprite);
  groupB.add(ghostSpriteB);
  groupB.position.copy(sprite.position);
  sprite.position.set(0, 0, 0);
  ghostSpriteB.position.set(0.005, 0, 0);
  scene.add(groupB);
  codeSnippets.push({
    group: groupB,
    sprite,
    ghost: ghostSpriteB,
    fullText: biasLines[Math.floor(Math.random() * biasLines.length)],
    visibleChars: 0,
    charSpeed: 0.2 + Math.random() * 0.5,
    life: Math.random(),
    state: 'typing',
    basePos: sprite.position.clone(),
    phase: Math.random() * Math.PI * 2,
    isBias: true,
    ghostGlitch: 0,
  });
}

// ─── Connection lines (constellations) ────────────────────────
const connectionPairs: [number, number][] = [];
for (let i = 0; i < particleCount; i++) {
  for (let j = i + 1; j < Math.min(i + 6, particleCount); j++) {
    const dx = particlePos[i * 3] - particlePos[j * 3];
    const dy = particlePos[i * 3 + 1] - particlePos[j * 3 + 1];
    const dz = particlePos[i * 3 + 2] - particlePos[j * 3 + 2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < 0.8) connectionPairs.push([i, j]);
  }
}
const connPositions: number[] = [];
for (const [a, b] of connectionPairs) {
  connPositions.push(
    particlePos[a * 3], particlePos[a * 3 + 1], particlePos[a * 3 + 2],
    particlePos[b * 3], particlePos[b * 3 + 1], particlePos[b * 3 + 2],
  );
}
const connGeo = new THREE.BufferGeometry();
connGeo.setAttribute('position', new THREE.Float32BufferAttribute(connPositions, 3));
const connMat = new THREE.LineBasicMaterial({
  color: 0x777777,
  transparent: true,
  opacity: 0.04,
  depthWrite: false,
});
const connLines = new THREE.LineSegments(connGeo, connMat);
connLines.renderOrder = 1;
scene.add(connLines);

// ─── Light bursts ─────────────────────────────────────────────
const burstCount = 6;
const bursts: { sprite: THREE.Sprite; progress: number; speed: number; angle: number }[] = [];
const burstCanvas = document.createElement('canvas');
burstCanvas.width = 64;
burstCanvas.height = 64;
const bCtx = burstCanvas.getContext('2d')!;
const grad = bCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
grad.addColorStop(0, 'rgba(100, 60, 180, 1)');
grad.addColorStop(0.3, 'rgba(60, 30, 120, 0.5)');
grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
bCtx.fillStyle = grad;
bCtx.fillRect(0, 0, 64, 64);
const burstTex = new THREE.CanvasTexture(burstCanvas);

for (let i = 0; i < burstCount; i++) {
  const bMat = new THREE.SpriteMaterial({
    map: burstTex,
    transparent: true,
    depthWrite: false,
    opacity: 0,
    blending: THREE.AdditiveBlending,
  });
  const bSprite = new THREE.Sprite(bMat);
  bSprite.scale.set(0.5, 0.5, 1);
  scene.add(bSprite);
  bursts.push({
    sprite: bSprite,
    progress: Math.random(),
    speed: 0.1 + Math.random() * 0.2,
    angle: Math.random() * Math.PI * 2,
  });
}

// ─── Face fragments (loaded async) ────────────────────────────
let faceFragments: Awaited<ReturnType<typeof createFaceFragments>> | null = null;

createFaceFragments(scene).then(ff => {
  faceFragments = ff;
  console.log('Face fragments loaded');
}).catch(err => {
  console.warn('Failed to load face fragments:', err);
});

// ─── Resize ───────────────────────────────────────────────────
const TARGET_W = 1080;
const TARGET_H = 1920;

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const aspect = w / h;

  let renderW: number, renderH: number;
  if (aspect > TARGET_W / TARGET_H) {
    renderH = h;
    renderW = h * (TARGET_W / TARGET_H);
  } else {
    renderW = w;
    renderH = w / (TARGET_W / TARGET_H);
  }

  renderer.setSize(Math.round(renderW), Math.round(renderH), false);
  renderer.domElement.style.width = `${Math.round(renderW)}px`;
  renderer.domElement.style.height = `${Math.round(renderH)}px`;

  camera.aspect = renderW / renderH;
  camera.updateProjectionMatrix();

  uniforms.uResolution.value.set(TARGET_W, TARGET_H);
}

window.addEventListener('resize', resize);
resize();

// ─── App state ─────────────────────────────────────────────────
let appState: 'reposo' | 'lectura' = 'reposo';
let capturedPhotoBase64: string | null = null;

// ─── Stream tracking — thinking box phases ────────────────────
let streamPhase: 'idle' | 'thinking' | 'descripcion' | 'prompt_en' | 'prompt_es' | 'done' = 'idle';
let thinkingBuffer = '';
let descriptionBuffer = '';
let promptENBuffer = '';
let promptESBuffer = '';
let pendingChunks: { channel: string; delta: string; done: boolean }[] = [];

// ─── Description sprites — continuous typing/drifting/fading ──
interface DescSprite {
  sprite: THREE.Sprite;
  ghost: THREE.Sprite;
  text: string;
  visibleChars: number;
  charSpeed: number;
  phase: number;
  life: number;
  state: 'typing' | 'display' | 'fading';
  basePos: THREE.Vector3;
  vel: THREE.Vector3;
}
let descSprites: DescSprite[] = [];
let storedDescription = '';
let descLinesPool: string[] = [];
const DESC_SPRITE_COUNT = 25;

function makeDescTexture(text: string, progress: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  const MAX_W = 1000;
  const LINE_H = 28;
  // Wrap long text to two lines
  ctx.font = '22px Consolas, "Courier New", monospace';
  let line1 = text;
  let line2 = '';
  if (ctx.measureText(text).width > MAX_W - 16) {
    // Find break point
    let breakAt = Math.floor(text.length * 0.55);
    while (breakAt > 0 && text[breakAt] !== ' ' && text[breakAt] !== ':' && text[breakAt] !== ',') breakAt--;
    if (breakAt <= 0) breakAt = Math.floor(text.length * 0.5);
    line1 = text.slice(0, breakAt).trim();
    line2 = text.slice(breakAt).trim();
  }
  const totalH = line2 ? LINE_H * 2 + 4 : LINE_H + 8;
  c.width = MAX_W;
  c.height = totalH;
  ctx.clearRect(0, 0, MAX_W, totalH);
  ctx.font = '22px Consolas, "Courier New", monospace';
  ctx.textBaseline = 'middle';
  const totalChars = line1.length + line2.length;
  const totalLen = text.length;
  const charsToShow = Math.floor(totalLen * progress);
  // Line 1
  const len1 = Math.min(line1.length, charsToShow);
  const display1 = line1.slice(0, len1);
  ctx.fillStyle = 'rgba(210, 220, 240, 0.8)';
  ctx.fillText(display1, 8, LINE_H / 2 + 2);
  if (len1 < line1.length && charsToShow <= line1.length) {
    ctx.fillStyle = 'rgba(210, 220, 240, 0.5)';
    ctx.fillText('▊', 8 + ctx.measureText(display1).width, LINE_H / 2);
  }
  // Line 2
  if (line2) {
    const charsForLine2 = Math.max(0, charsToShow - line1.length);
    const display2 = line2.slice(0, Math.min(line2.length, charsForLine2));
    ctx.fillStyle = 'rgba(210, 220, 240, 0.8)';
    ctx.fillText(display2, 8, LINE_H * 1.5 + 4);
    if (charsForLine2 < line2.length && charsToShow > line1.length) {
      ctx.fillStyle = 'rgba(210, 220, 240, 0.5)';
      ctx.fillText('▊', 8 + ctx.measureText(display2).width, LINE_H * 1.5 + 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function spawnDescSprite() {
  if (descLinesPool.length === 0) return;
  const line = descLinesPool[Math.floor(Math.random() * descLinesPool.length)];
  const tex = makeDescTexture(line, 0);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 });
  const sprite = new THREE.Sprite(mat);
  const ghostMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 });
  const ghost = new THREE.Sprite(ghostMat);
  const zDepth = -0.3 - Math.random() * 4;
  const spread = -zDepth * (0.15 + Math.random() * 0.6);
  const angle = Math.random() * Math.PI * 2;
  const bp = new THREE.Vector3(Math.cos(angle) * spread, Math.sin(angle) * spread * 0.6, zDepth);
  const s = 0.02 + Math.random() * 0.025;
  sprite.position.copy(bp);
  sprite.scale.set(s * 15, s, 1);
  sprite.renderOrder = 8;
  ghost.position.copy(bp);
  ghost.position.x += 0.004;
  ghost.position.y += 0.002;
  ghost.scale.set(s * 15.5, s * 1.05, 1);
  ghost.renderOrder = 7;
  scene.add(sprite);
  scene.add(ghost);
  descSprites.push({
    sprite, ghost, text: line,
    visibleChars: 0, charSpeed: 3 + Math.random() * 5,
    phase: Math.random() * Math.PI * 2,
    life: 0, state: 'typing',
    basePos: bp.clone(),
    vel: new THREE.Vector3((Math.random() - 0.5) * 0.0003, (Math.random() - 0.5) * 0.0003, 0),
  });
}

function createDescriptionSprites(desc: string) {
  destroyDescriptionSprites();
  // Parse lines into pool
  descLinesPool = desc.split('\n')
    .map(l => l.replace(/^\*\s*/, '').trim())
    .filter(l => l.length > 5)
    .slice(0, 30);
  if (descLinesPool.length === 0) descLinesPool = ['analizando...'];
  // Spawn initial batch
  for (let i = 0; i < Math.min(10, DESC_SPRITE_COUNT); i++) {
    spawnDescSprite();
  }
}

function destroyDescriptionSprites() {
  for (const ds of descSprites) {
    scene.remove(ds.sprite);
    scene.remove(ds.ghost);
    ds.sprite.material.map?.dispose();
    ds.sprite.material.dispose();
    ds.ghost.material.map?.dispose();
    ds.ghost.material.dispose();
  }
  descSprites = [];
}

// ─── Question sprites — float during thinking phase ──
const QUESTIONS = [
  '¿Qué edad tiene esta persona?',
  '¿Color de sus ojos?',
  '¿Cómo es su cabello?',
  '¿Qué expresión facial tiene?',
  '¿Forma del rostro?',
  '¿Tiene alguna marca distintiva?',
  '¿Cómo viste?',
  '¿Qué tono de piel?',
  '¿Cejas finas o gruesas?',
  '¿Labios finos o carnosos?',
  '¿Nariz recta o aguileña?',
  '¿Estructura ósea marcada?',
  '¿Iluminación de la escena?',
  '¿Fondo claro u oscuro?',
  '¿El mentón es marcado?',
  '¿Pómulos altos o bajos?',
  '¿Arco de las cejas?',
  '¿La mirada es directa?',
  '¿Sonrisa o gesto serio?',
  '¿Hay accesorios visibles?',
];
let questionSprites: DescSprite[] = [];
const QUESTION_TOTAL = 30;

function spawnQuestionSprite() {
  const line = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
  const tex = makeDescTexture(line, 0);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 });
  const sprite = new THREE.Sprite(mat);
  const ghostMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 });
  const ghost = new THREE.Sprite(ghostMat);
  const zDepth = -0.3 - Math.random() * 5;
  const spread = -zDepth * (0.12 + Math.random() * 0.5);
  const angle = Math.random() * Math.PI * 2;
  const bp = new THREE.Vector3(Math.cos(angle) * spread, Math.sin(angle) * spread * 0.5, zDepth);
  const s = 0.015 + Math.random() * 0.02;
  sprite.position.copy(bp);
  sprite.scale.set(s * 16, s, 1);
  sprite.renderOrder = 8;
  ghost.position.copy(bp);
  ghost.position.x += 0.003;
  ghost.position.y += 0.001;
  ghost.scale.set(s * 16.5, s * 1.05, 1);
  ghost.renderOrder = 7;
  scene.add(sprite);
  scene.add(ghost);
  questionSprites.push({
    sprite, ghost, text: line,
    visibleChars: 0, charSpeed: 2 + Math.random() * 4,
    phase: Math.random() * Math.PI * 2,
    life: 0, state: 'typing',
    basePos: bp.clone(),
    vel: new THREE.Vector3((Math.random() - 0.5) * 0.0002, (Math.random() - 0.5) * 0.0002, 0),
  });
}

function destroyQuestionSprites() {
  for (const qs of questionSprites) {
    scene.remove(qs.sprite);
    scene.remove(qs.ghost);
    qs.sprite.material.map?.dispose();
    qs.sprite.material.dispose();
    qs.ghost.material.map?.dispose();
    qs.ghost.material.dispose();
  }
  questionSprites = [];
}

// ─── Floating face snapshots (during thinking/descripcion phase) ──
interface FaceSnapshot {
  mesh: THREE.Mesh;
  ghost: THREE.Mesh;
  phase: number;
  life: number;
  state: 'rising' | 'drifting' | 'fading';
  basePos: THREE.Vector3;
  vel: THREE.Vector3;
  rotSpeed: THREE.Vector3;
  ghostOffset: THREE.Vector3;
  glitchTimer: number;
}
let faceSnapshots: FaceSnapshot[] = [];
let faceSnapshotTex: THREE.CanvasTexture | null = null;
const FACE_SNAPSHOT_COUNT = 100;

function makeCannySnapshotTexture(img: HTMLImageElement): THREE.CanvasTexture {
  const border = 10;
  const size = 320;
  const c = document.createElement('canvas');
  c.width = size + border * 2;
  c.height = size + border * 2;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;
  ctx.save();
  ctx.translate(c.width / 2, 0);
  ctx.scale(-1, 1);
  ctx.translate(-c.width / 2, 0);
  ctx.filter = 'grayscale(100%) contrast(1.5) brightness(1.2)';
  ctx.drawImage(img, border, border, size, size);
  ctx.restore();
  ctx.shadowColor = 'transparent';
  const imgData = ctx.getImageData(border, border, size, size);
  const d = imgData.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (y % 2 === 0) {
        d[i] = 0; d[i+1] = 0; d[i+2] = 0;
      } else if (y % 4 === 1) {
        d[i] *= 0.3; d[i+1] *= 0.3; d[i+2] *= 0.3;
      }
    }
  }
  ctx.putImageData(imgData, border, border);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function applyCannyToFaceSnapshots() {
  if (!cannyEdgeBase64) return;
  const img = new Image();
  img.onload = () => {
    const newTex = makeCannySnapshotTexture(img);
    // Update all existing face snapshot materials
    for (const fs of faceSnapshots) {
      (fs.mesh.material as THREE.MeshBasicMaterial).map = newTex;
      (fs.mesh.material as THREE.MeshBasicMaterial).needsUpdate = true;
      (fs.ghost.material as THREE.MeshBasicMaterial).map = newTex;
      (fs.ghost.material as THREE.MeshBasicMaterial).needsUpdate = true;
    }
    // Update shared texture reference for future spawns
    if (faceSnapshotTex) faceSnapshotTex.dispose();
    faceSnapshotTex = newTex;
  };
  img.src = cannyEdgeBase64;
}

function makeFaceSnapshotTexture(src: string): Promise<THREE.CanvasTexture> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const border = 10;
      const size = 320;
      c.width = size + border * 2;
      c.height = size + border * 2;
      const ctx = c.getContext('2d')!;
      // White polaroid border
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(0, 0, c.width, c.height);
      // Shadow
      ctx.shadowColor = 'rgba(0,0,0,0.2)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      // Mirror + black & white
      ctx.save();
      ctx.translate(c.width / 2, 0);
      ctx.scale(-1, 1);
      ctx.translate(-c.width / 2, 0);
      ctx.filter = 'grayscale(100%) contrast(1.1)';
      ctx.drawImage(img, border, border, size, size);
      ctx.restore();
      ctx.shadowColor = 'transparent';

      // Strong scanlines effect
      const imgData = ctx.getImageData(border, border, size, size);
      const d = imgData.data;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = (y * size + x) * 4;
          if (y % 2 === 0) {
            // Every 2nd row: completely black
            d[i] = 0; d[i+1] = 0; d[i+2] = 0;
          } else if (y % 4 === 1) {
            // Intermediate rows: dim
            d[i] *= 0.3; d[i+1] *= 0.3; d[i+2] *= 0.3;
          }
        }
      }
      ctx.putImageData(imgData, border, border);
      const tex = new THREE.CanvasTexture(c);
      tex.needsUpdate = true;
      resolve(tex);
    };
    img.src = src;
  });
}

const planeGeo = new THREE.PlaneGeometry(1, 1);

function spawnFaceSnapshot() {
  if (!faceSnapshotTex) return;
  const mat = new THREE.MeshBasicMaterial({ map: faceSnapshotTex, transparent: true, depthWrite: false, opacity: 0 });
  const mesh = new THREE.Mesh(planeGeo, mat);
  const ghostMat2 = new THREE.MeshBasicMaterial({ map: faceSnapshotTex, transparent: true, depthWrite: false, opacity: 0 });
  const ghost = new THREE.Mesh(planeGeo, ghostMat2);
  // Mix of depths: some very close, some far
  const zDepth = Math.random() < 0.2
    ? -(0.08 + Math.random() * 0.3)   // 20% chance: very close (0.08–0.38)
    : -(0.3 + Math.random() * 8);      // 80%: normal range (0.3–8.3)
  const spread = -zDepth * (0.15 + Math.random() * 0.8);
  const angle = Math.random() * Math.PI * 2;
  const bp = new THREE.Vector3(Math.cos(angle) * spread, -0.8 + Math.random() * 1.6, zDepth);
  const s = 0.025 + Math.random() * 0.055;
  mesh.position.copy(bp);
  mesh.scale.set(s * 1.2, s * 1.2, 1);
  mesh.renderOrder = 6;
  mesh.rotation.x = (Math.random() - 0.5) * 1.2;
  mesh.rotation.y = (Math.random() - 0.5) * 1.2;
  mesh.rotation.z = (Math.random() - 0.5) * 0.8;
  const gox = (Math.random() - 0.5) * 0.02;
  const goy = (Math.random() - 0.5) * 0.015;
  ghost.position.copy(bp);
  ghost.position.x += gox;
  ghost.position.y += goy;
  ghost.position.z += (Math.random() - 0.5) * 0.005;
  ghost.scale.set(s * 1.2 * 1.02, s * 1.2 * 1.02, 1);
  ghost.renderOrder = 5;
  ghost.rotation.copy(mesh.rotation);
  scene.add(mesh);
  scene.add(ghost);
  faceSnapshots.push({
    mesh, ghost,
    phase: Math.random() * Math.PI * 2,
    life: 0,
    state: 'rising',
    basePos: bp.clone(),
    vel: new THREE.Vector3((Math.random() - 0.5) * 0.0004, (Math.random() - 0.5) * 0.0004, 0),
    rotSpeed: new THREE.Vector3((Math.random() - 0.5) * 0.0006, (Math.random() - 0.5) * 0.0008, (Math.random() - 0.5) * 0.0004),
    ghostOffset: new THREE.Vector3(gox, goy, 0),
    glitchTimer: 0.06 + Math.random() * 0.1,
  });
}

function destroyFaceSnapshots() {
  for (const fs of faceSnapshots) {
    scene.remove(fs.mesh);
    scene.remove(fs.ghost);
    (fs.mesh.material as THREE.MeshBasicMaterial).dispose();
    (fs.ghost.material as THREE.MeshBasicMaterial).dispose();
  }
  faceSnapshots = [];
  if (faceSnapshotTex) {
    faceSnapshotTex.dispose();
    faceSnapshotTex = null;
  }
}

async function startFaceSnapshots() {
  destroyFaceSnapshots();
  if (!capturedPhotoBase64) return;
  faceSnapshotTex = await makeFaceSnapshotTexture(capturedPhotoBase64);
  // Spawn initial batch
  for (let i = 0; i < Math.min(40, FACE_SNAPSHOT_COUNT); i++) {
    spawnFaceSnapshot();
  }
}

// ─── Reveal step polaroids — accumulate during the reveal ────
let stepPolaroids: FaceSnapshot[] = [];

function makeStepPolaroidTexture(src: string): Promise<THREE.CanvasTexture | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const fail = () => resolve(null);
    const timer = setTimeout(fail, 5000); // never hang the progression
    img.onload = () => {
      clearTimeout(timer);
      try {
        const c = document.createElement('canvas');
        const border = 10;
        const size = 320;
        c.width = size + border * 2;
        c.height = size + border * 2;
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.shadowColor = 'rgba(0,0,0,0.2)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        // Mirror (like camera feed)
        ctx.save();
        ctx.translate(c.width / 2, 0);
        ctx.scale(-1, 1);
        ctx.translate(-c.width / 2, 0);
        ctx.drawImage(img, border, border, size, size);
        ctx.restore();
        ctx.shadowColor = 'transparent';
        const tex = new THREE.CanvasTexture(c);
        tex.needsUpdate = true;
        resolve(tex);
      } catch (e) {
        resolve(null);
      }
    };
    img.onerror = fail;
    img.src = src;
  });
}

function spawnStepPolaroid(tex: THREE.CanvasTexture, big = false) {
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 });
  const mesh = new THREE.Mesh(planeGeo, mat);
  const ghostMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 });
  const ghost = new THREE.Mesh(planeGeo, ghostMat);
  let zDepth: number, bp: THREE.Vector3, s: number;
  if (big) {
    zDepth = -1.2;
    bp = new THREE.Vector3(0, 0, zDepth);
    s = 0.5;
  } else {
    zDepth = -(0.4 + Math.random() * 2.5);
    const spread = -zDepth * (0.25 + Math.random() * 0.7);
    const angle = Math.random() * Math.PI * 2;
    bp = new THREE.Vector3(Math.cos(angle) * spread, -0.7 + Math.random() * 1.4, zDepth);
    s = 0.05 + Math.random() * 0.05;
  }
  mesh.position.copy(bp);
  mesh.scale.set(s * 1.2, s * 1.2, 1);
  mesh.renderOrder = 6;
  mesh.rotation.set((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 0.8);
  ghost.position.copy(bp);
  ghost.position.z += 0.005;
  ghost.scale.copy(mesh.scale).multiplyScalar(1.02);
  ghost.rotation.copy(mesh.rotation);
  ghost.renderOrder = 5;
  scene.add(mesh);
  scene.add(ghost);
  stepPolaroids.push({
    mesh, ghost,
    phase: Math.random() * Math.PI * 2,
    life: 0,
    state: 'rising',
    basePos: bp.clone(),
    vel: new THREE.Vector3((Math.random() - 0.5) * 0.0002, (Math.random() - 0.5) * 0.0002, 0),
    rotSpeed: new THREE.Vector3((Math.random() - 0.5) * 0.0004, (Math.random() - 0.5) * 0.0005, (Math.random() - 0.5) * 0.0003),
    ghostOffset: new THREE.Vector3((Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.015, 0),
    glitchTimer: 0.06 + Math.random() * 0.1,
  });
}

function destroyStepPolaroids() {
  for (const sp of stepPolaroids) {
    scene.remove(sp.mesh);
    scene.remove(sp.ghost);
    (sp.mesh.material as THREE.MeshBasicMaterial).dispose();
    (sp.ghost.material as THREE.MeshBasicMaterial).dispose();
  }
  stepPolaroids = [];
}

// ─── LECTURA layers ────────────────────────────────────────────
const revealMeshObj = createRevealMesh();
scene.add(revealMeshObj.mesh);

let faceAssembly: Awaited<ReturnType<typeof createFaceAssembly>> | null = null;
let analysisHUD: Awaited<ReturnType<typeof createAnalysisHUD>> | null = null;
const lecturaThinking = createLecturaThinking();
const promptBox = createPromptBox();

// Wave hint text — appears below the description box when ready to advance
const lecturaWaveHint = document.createElement('div');
lecturaWaveHint.id = 'lectura-wave-hint';
lecturaWaveHint.style.cssText = [
  'font: 13px Consolas, "Courier New", monospace;',
  'font-style: italic;',
  'text-transform: uppercase;',
  'letter-spacing: 1px;',
  'color: rgb(220, 210, 120);',
  'text-align: center;',
  'margin-top: 14px;',
  'text-shadow: 0 0 8px rgba(0,0,0,0.9);',
  'display: none;',
  'pointer-events: none;',
].join('');
lecturaWaveHint.innerHTML = '> Saludá con la mano para continuar ' + WAVE_SVG;
document.getElementById('lectura-thinking')?.appendChild(lecturaWaveHint);

// Prompt wave hint — appears below the prompt box when generation is ready
const promptWaveHint = document.createElement('div');
promptWaveHint.id = 'prompt-wave-hint';
promptWaveHint.style.cssText = [
  'font: 13px Consolas, "Courier New", monospace;',
  'font-style: italic;',
  'text-transform: uppercase;',
  'letter-spacing: 1px;',
  'color: rgb(220, 210, 120);',
  'text-align: center;',
  'margin-top: 14px;',
  'text-shadow: 0 0 8px rgba(0,0,0,0.9);',
  'display: none;',
  'pointer-events: none;',
].join('');
promptWaveHint.innerHTML = '> Saludá con la mano para continuar ' + WAVE_SVG;
document.getElementById('prompt-box')?.appendChild(promptWaveHint);

// ─── Reveal stage (REVELACION) — central polaroid + accumulating background ─
const REVEAL_PHOTO_SIZE = 'min(62vw, 420px)';
const REVEAL_PROGRESS_SIZE = 'min(78vw, 600px)';
const revealStageEl = document.createElement('div');
revealStageEl.id = 'revelacion-stage';
revealStageEl.style.cssText = [
  'position:fixed;top:0;left:0;width:100%;height:100%;',
  'display:none;flex-direction:column;align-items:center;justify-content:center;',
  'gap:14px;',
  'pointer-events:none;z-index:900;',
  'opacity:0;',
  'transition:opacity 0.8s ease;',
].join('');
document.body.appendChild(revealStageEl);

// Big title (only during progression, hidden at the final)
const revealTitleEl = document.createElement('div');
revealTitleEl.id = 'revelacion-title';
revealTitleEl.style.cssText = [
  'font: 26px Consolas, "Courier New", monospace;',
  'font-style: italic;',
  'text-transform: uppercase;',
  'letter-spacing: 2px;',
  'color: rgb(220, 210, 120);',
  'text-align: center;',
  'text-shadow: 0 0 12px rgba(0,0,0,0.9);',
].join('');
revealTitleEl.textContent = '> Generando tu reflejo...';
revealStageEl.appendChild(revealTitleEl);

// Label above the original photo (yellow)
const revealOriginalLabel = document.createElement('div');
revealOriginalLabel.id = 'revelacion-original-label';
revealOriginalLabel.style.cssText = [
  'font: 19px Consolas, "Courier New", monospace;',
  'font-style: italic;',
  'text-transform: uppercase;',
  'letter-spacing: 2px;',
  'color: rgb(220, 210, 120);',
  'text-align: center;',
  'text-shadow: 0 0 12px rgba(0,0,0,0.9);',
  'display: none;',
].join('');
revealOriginalLabel.textContent = '> Tu cara';
revealStageEl.appendChild(revealOriginalLabel);

// Original photo polaroid (same size as the reflection)
const revealOriginalWrap = document.createElement('div');
revealOriginalWrap.id = 'revelacion-original';
revealOriginalWrap.style.cssText = [
  'width:' + REVEAL_PHOTO_SIZE + ';',
  'height:' + REVEAL_PHOTO_SIZE + ';',
  'background:rgba(255,255,255,0.92);',
  'padding:10px;',
  'border-radius:2px;',
  'box-shadow:0 6px 30px rgba(0,0,0,0.55);',
  'display:none;',
].join('');
revealStageEl.appendChild(revealOriginalWrap);

const revealOriginalImg = document.createElement('img');
revealOriginalImg.id = 'revelacion-original-img';
revealOriginalImg.style.cssText = [
  'width:100%;height:100%;object-fit:cover;display:block;',
  '-webkit-transform:scaleX(-1);transform:scaleX(-1);',
].join('');
revealOriginalWrap.appendChild(revealOriginalImg);

// Label above the reflection photo (green)
const revealReflectionLabel = document.createElement('div');
revealReflectionLabel.id = 'revelacion-reflection-label';
revealReflectionLabel.style.cssText = [
  'font: 19px Consolas, "Courier New", monospace;',
  'font-style: italic;',
  'text-transform: uppercase;',
  'letter-spacing: 2px;',
  'color: #4ade80;',
  'text-align: center;',
  'text-shadow: 0 0 12px rgba(0,0,0,0.9);',
  'display: none;',
].join('');
revealReflectionLabel.textContent = '> Reflejo generado';
revealStageEl.appendChild(revealReflectionLabel);

// Reflection polaroid (goes through every denoise step during progression)
const revealCentralWrap = document.createElement('div');
revealCentralWrap.id = 'revelacion-central';
revealCentralWrap.style.cssText = [
  'width:' + REVEAL_PHOTO_SIZE + ';',
  'height:' + REVEAL_PHOTO_SIZE + ';',
  'background:rgba(255,255,255,0.92);',
  'padding:10px;',
  'border-radius:2px;',
  'box-shadow:0 6px 30px rgba(0,0,0,0.55);',
  'animation:revealFloat 5s ease-in-out infinite;',
].join('');
revealStageEl.appendChild(revealCentralWrap);

const revealCentralImg = document.createElement('img');
revealCentralImg.id = 'revelacion-central-img';
revealCentralImg.style.cssText = [
  'width:100%;height:100%;object-fit:cover;display:block;',
  '-webkit-transform:scaleX(-1);transform:scaleX(-1);',
].join('');
revealCentralWrap.appendChild(revealCentralImg);

// Sub text (just below the reflection)
const revealSubEl = document.createElement('div');
revealSubEl.id = 'revelacion-sub';
revealSubEl.style.cssText = [
  'font: 15px Consolas, "Courier New", monospace;',
  'font-style: italic;',
  'text-transform: uppercase;',
  'letter-spacing: 1px;',
  'color: rgba(210, 220, 240, 0.85);',
  'text-align: center;',
  'text-shadow: 0 0 8px rgba(0,0,0,0.9);',
].join('');
revealSubEl.textContent = '';
revealStageEl.appendChild(revealSubEl);

// Float keyframes for the reflection polaroid
const revealFloatStyle = document.createElement('style');
revealFloatStyle.textContent = `
  @keyframes revealFloat {
    0% { transform: translateY(-4px); }
    50% { transform: translateY(4px); }
    100% { transform: translateY(-4px); }
  }
`;
document.head.appendChild(revealFloatStyle);

// ─── ESPEJO ACTIVO — live swapped reflection ──────────────
const swapImgEl = document.createElement('img');
swapImgEl.id = 'swap-feed';
swapImgEl.style.cssText = [
  'position:fixed;top:0;left:0;width:100%;height:100%;',
  'object-fit:cover;display:none;pointer-events:none;z-index:950;',
  '-webkit-transform:scaleX(-1);transform:scaleX(-1);',
].join('');
document.body.appendChild(swapImgEl);
let espejoActive = false;

let revealToken = 0;
let revealDone = false;
let revealActive = false;
let revealDoneAt = 0; // clock time when the reveal finished (grace before espejo wave)

function clearRevealStage() {
  revealToken++;
  revealDone = false;
  revealActive = false;
  destroyStepPolaroids();
  revealTitleEl.style.display = '';
  revealOriginalLabel.style.display = 'none';
  revealOriginalWrap.style.display = 'none';
  revealReflectionLabel.style.display = 'none';
  revealStageEl.style.opacity = '0';
  setTimeout(() => { revealStageEl.style.display = 'none'; }, 800);
}

/** Convert all background polaroids (steps + canny) to the final image. */
function morphBackgroundToFinal(tex: THREE.CanvasTexture) {
  for (const sp of stepPolaroids) {
    const sm = sp.mesh.material as THREE.MeshBasicMaterial;
    const sg = sp.ghost.material as THREE.MeshBasicMaterial;
    if (sm.map && sm.map !== tex) sm.map.dispose();
    if (sg.map && sg.map !== tex) sg.map.dispose();
    sm.map = tex; sm.needsUpdate = true;
    sg.map = tex; sg.needsUpdate = true;
  }
  for (const fs of faceSnapshots) {
    const sm = fs.mesh.material as THREE.MeshBasicMaterial;
    const sg = fs.ghost.material as THREE.MeshBasicMaterial;
    if (sm.map && sm.map !== tex) sm.map.dispose();
    if (sg.map && sg.map !== tex) sg.map.dispose();
    sm.map = tex; sm.needsUpdate = true;
    sg.map = tex; sg.needsUpdate = true;
  }
}

async function playRevealSteps(token: number) {
  const steps = genPreviewSteps.slice();
  const total = Math.max(steps.length, 1);
  for (let i = 0; i < steps.length; i++) {
    if (token !== revealToken) return;
    revealSubEl.textContent = `> Paso ${i + 1} / ${total}`;
    // The central polaroid goes through every denoise step (visible progression)
    revealCentralImg.src = steps[i];
    // Each step also adds a couple of polaroids of this step to the background
    const tex = await makeStepPolaroidTexture(steps[i]);
    if (token !== revealToken) { if (tex) tex.dispose(); return; }
    if (tex) {
      spawnStepPolaroid(tex);
      spawnStepPolaroid(tex);
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  if (token !== revealToken) return;
  // Shrink to final size so original + reflection match
  revealCentralWrap.style.width = REVEAL_PHOTO_SIZE;
  revealCentralWrap.style.height = REVEAL_PHOTO_SIZE;
  revealCentralWrap.style.padding = '10px';
  // Final layout: TU CARA (yellow) → original, REFLEJO GENERADO (green) → reflection
  revealTitleEl.style.display = 'none';
  revealOriginalLabel.style.display = 'block';
  revealReflectionLabel.style.display = 'block';
  if (capturedPhotoBase64) {
    revealOriginalImg.src = capturedPhotoBase64;
    revealOriginalWrap.style.display = 'block';
  }
  revealSubEl.textContent = '> Finalizando...';
  // Reveal the generated image in the central polaroid
  if (finalPortraitBase64) {
    revealCentralImg.src = finalPortraitBase64;
    // All background polaroids become the final image
    const ftex = await makeStepPolaroidTexture(finalPortraitBase64);
    if (token !== revealToken) { if (ftex) ftex.dispose(); return; }
    if (ftex) morphBackgroundToFinal(ftex);
  }
  // Warm-white flash, like the canny reveal
  revealMeshObj.trigger();
  revealSubEl.innerHTML = '> Saludá para conocer a tu reflejo ' + WAVE_SVG;
  revealDone = true;
  revealDoneAt = Date.now();
}

function doRevealPortrait() {
  promptBox.hide();
  const hint = document.getElementById('prompt-wave-hint');
  if (hint) hint.style.display = 'none';
  const th = document.getElementById('lectura-thinking');
  if (th && th.style.display !== 'none') lecturaThinking.hide();
  if (analysisHUD) analysisHUD.hide();
  const st = document.getElementById('lectura-status');
  if (st) st.style.display = 'none';
  if (!finalPortraitBase64 && genPreviewSteps.length === 0) return;

  destroyStepPolaroids();
  revealActive = true;
  const token = ++revealToken;
  // Big central polaroid during the denoise progression
  revealCentralWrap.style.width = REVEAL_PROGRESS_SIZE;
  revealCentralWrap.style.height = REVEAL_PROGRESS_SIZE;
  revealCentralWrap.style.padding = '14px';
  revealTitleEl.style.display = '';
  revealTitleEl.textContent = '> Generando tu reflejo...';
  revealTitleEl.style.color = 'rgb(220, 210, 120)';
  revealOriginalLabel.style.display = 'none';
  revealOriginalWrap.style.display = 'none';
  revealReflectionLabel.style.display = 'none';
  revealStageEl.style.display = 'flex';
  requestAnimationFrame(() => { revealStageEl.style.opacity = '1'; });
  playRevealSteps(token);
}

let storedPromptES = '';
let promptESReady = false;
let promptESDeferred = false;
let waitingDescWave = false; // after descripcion done, waiting for wave to advance
let descWaveReadyTimer = 0;  // minimum time before wave is accepted
let descCountdown = 0; // countdown timer for description generation
// Post-wave phases: prompt_countdown → prompt_done → contours_countdown → contours_done
let postWavePhase: '' | 'prompt_countdown' | 'prompt_done' | 'contours_countdown' | 'contours_done' = '';
let postWaveTimer = 0;
let cannyEdgeBase64: string | null = null;
let waitingForCannyMorph = false;
let finalPortraitBase64: string | null = null;
let promptShownAt = -1;         // clock time when prompt box appeared
let promptWaveHintShown = false; // hint below prompt box currently visible
let genPreviewSteps: string[] = []; // buffered denoise progression (noise → final)

let lecturaLayersReady = false;

// Initialize LECTURA layers (loads models, so async)
(async function initLecturaLayers() {
  try {
    const [fa, ah] = await Promise.all([
      createFaceAssembly(scene),
      createAnalysisHUD(),
    ]);
    faceAssembly = fa;
    analysisHUD = ah;

    lecturaLayersReady = true;
    console.log('LECTURA layers ready');
  } catch (err) {
    console.warn('Failed to init LECTURA layers:', err);
  }
})();

function enterLectura() {
  if (!lecturaLayersReady) return;
  appState = 'lectura';
  streamPhase = 'idle';
  thinkingBuffer = '';
  descriptionBuffer = '';
  promptENBuffer = '';
  promptESBuffer = '';
  pendingChunks = [];
  storedPromptES = '';
  promptESReady = false;
  promptESDeferred = false;
  cannyEdgeBase64 = null;
  waitingForCannyMorph = false;
  finalPortraitBase64 = null;
  promptShownAt = -1;
  promptWaveHintShown = false;
  genPreviewSteps = [];
  clearRevealStage();
  waitingDescWave = false;
  destroyDescriptionSprites();
  destroyQuestionSprites();

  // Stop encuadre tracking
  encuadreActive = false;
  encuadrePhase = 'position';

  // Hide REPOSO-specific 3D elements
  if (faceFragments) (faceFragments as any).setVisible(false);
  // Hide code snippets and bias
  for (const cs of codeSnippets) {
    (cs.sprite.material as THREE.SpriteMaterial).opacity = 0;
    (cs.ghost.material as THREE.SpriteMaterial).opacity = 0;
  }

  // Hide DOM overlays
  statusEl.style.display = 'none';
  dialogEl.style.display = 'none';
  hintEl.style.display = 'none';
  boxContainer.style.display = 'none';
  ovalContainer.style.display = 'none';
  encuadreTextEl.style.display = 'none';
  encuadreHintEl.style.display = 'none';
  camArrowEl.style.display = 'none';
  captureGuideEl.style.display = 'none';
  const backdrop = document.getElementById('encuadre-backdrop');
  if (backdrop) backdrop.style.display = 'none';
  const bright = document.getElementById('encuadre-bright');
  if (bright) bright.style.display = 'none';
  const countdown = document.getElementById('encuadre-countdown');
  if (countdown) countdown.style.display = 'none';
  const oval = document.getElementById('encuadre-oval');
  if (oval) oval.style.display = 'none';

  // Camera feed at very low opacity (faint background)
  camCanvas.style.opacity = '0.2';
  camCanvas.style.maskImage = 'none';

  // Trigger circular reveal
  revealMeshObj.trigger();

  // Show analysis HUD with captured photo
  if (analysisHUD) {
    if (debugPhotoImg) {
      analysisHUD.setPhoto(debugPhotoImg);
    } else if (capturedPhotoBase64) {
      const img = new Image();
      img.onload = () => {
        analysisHUD!.setPhoto(img);
        console.log('Analysis HUD: photo set from capture');
      };
      img.onerror = () => console.warn('Analysis HUD: failed to load captured photo');
      img.src = capturedPhotoBase64;
    }
    analysisHUD.show();
    console.log('Analysis HUD: shown, photo=' + (!!capturedPhotoBase64 || !!debugPhotoImg));
  } else {
    console.warn('Analysis HUD: null, cannot show photo');
  }

  // Start floating face snapshots in background
  startFaceSnapshots();

  // Status text below photo — main line + countdown subtitle
  const lecturaStatusEl = document.createElement('div');
  lecturaStatusEl.id = 'lectura-status';
  lecturaStatusEl.style.cssText = [
    'position: fixed;',
    'top: calc(32% + min(52vh, 400px) / 2 + 18px);',
    'left: 50%;',
    'transform: translateX(-50%);',
    'text-align: center;',
    'pointer-events: none;',
    'z-index: 601;',
  ].join('');

  const statusMain = document.createElement('div');
  statusMain.id = 'lectura-status-main';
  statusMain.style.cssText = [
    'font: 18px Consolas, "Courier New", monospace;',
    'font-style: italic;',
    'color: rgb(220,210,120);',
    'text-shadow: 0 0 12px rgba(0,0,0,0.95);',
    'white-space: nowrap;',
    'margin-bottom: 6px;',
  ].join('');
  statusMain.textContent = '> Describiendo a la persona frente al espejo...';

  const statusSub = document.createElement('div');
  statusSub.id = 'lectura-status-sub';
  statusSub.style.cssText = [
    'font: 14px Consolas, "Courier New", monospace;',
    'font-style: italic;',
    'color: rgba(200,190,140,0.7);',
    'text-shadow: 0 0 10px rgba(0,0,0,0.9);',
    'white-space: nowrap;',
  ].join('');
  descCountdown = 15;
  statusSub.textContent = '> Tiempo restante estimado: 15s';

  lecturaStatusEl.appendChild(statusMain);
  lecturaStatusEl.appendChild(statusSub);
  document.body.appendChild(lecturaStatusEl);

  // Flush any chunks that arrived before processing
  setTimeout(() => {
    if (appState === 'lectura' && pendingChunks.length > 0) {
      for (const pc of pendingChunks) {
        processStreamChunk(pc.channel, pc.delta, pc.done);
      }
      pendingChunks = [];
    }
    // In debug mode, simulate description arriving
    if (LECTURA_DEBUG) {
      const demoDesc = `* Género: Femenino\n* Edad aproximada: ~30 años\n* Etnia: Caucásica\n* Forma del rostro: Ovalada\n* Ojos: Marrones, forma almendrada\n* Nariz: Recta, tamaño mediano\n* Labios: Labios finos\n* Piel: Tono claro\n* Cabello: Castaño oscuro\n* Expresión: Neutral\n* Iluminación: Suave`;
      lecturaThinking.show();
      lecturaThinking.showDescription(demoDesc);
      descriptionBuffer = demoDesc;
      storedDescription = demoDesc;
      streamPhase = 'done';
      waitingDescWave = true;
      const stDbgMain = document.getElementById('lectura-status-main');
      if (stDbgMain) stDbgMain.textContent = '> Descripción lista. Generando prompt...';
      promptESReady = true; // simulate prompt_es ready
      setTimeout(() => {
        const stDbg2 = document.getElementById('lectura-status-main');
        if (stDbg2) stDbg2.innerHTML = '> Saludá con la mano para continuar ' + WAVE_SVG;
      }, 2000);
    }
  }, 500);
}

function leaveLectura() {
  appState = 'reposo';
  streamPhase = 'idle';
  thinkingBuffer = '';
  descriptionBuffer = '';
  promptENBuffer = '';
  promptESBuffer = '';
  pendingChunks = [];
  storedPromptES = '';
  promptESReady = false;
  promptESDeferred = false;
  cannyEdgeBase64 = null;
  waitingForCannyMorph = false;
  waitingDescWave = false;
  descWaveReadyTimer = 0;
  postWavePhase = '';
  postWaveTimer = 0;
  finalPortraitBase64 = null;
  promptShownAt = -1;
  promptWaveHintShown = false;
  genPreviewSteps = [];
  clearRevealStage();
  promptBox.hide();
  destroyDescriptionSprites();
  destroyFaceSnapshots();
  destroyQuestionSprites();

  // Restore REPOSO elements
  if (faceFragments) (faceFragments as any).setVisible(true);
  camCanvas.style.opacity = '';
  camCanvas.style.maskImage = '';
  statusEl.style.display = '';
  if (analysisHUD) analysisHUD.hide();
  const lst = document.getElementById('lectura-status');
  if (lst) lst.remove();
  // Keep thinking box visible for debugging
}

// ─── Status overlay (bottom of screen) ────────────────────────
const statusEl = document.createElement('div');
statusEl.id = 'detection-status';
statusEl.style.cssText = [
  'position:fixed;bottom:30px;left:0;right:0;text-align:center;',
  'font:14px Consolas,"Courier New",monospace;',
  'font-style:italic;',
  'text-transform:uppercase;',
  'letter-spacing:1px;',
  'color:rgba(140,160,190,0.55);',
  'pointer-events:none;z-index:100;',
  'text-shadow:0 0 8px rgba(0,0,0,0.8);',
  'transition:opacity 0.3s',
].join('');
statusEl.textContent = '> Esperando alguien para reflejar...';
document.body.appendChild(statusEl);
let statusTimer = 0;

// ─── Typing dialog (below face box) ───────────────────────────
const dialogEl = document.createElement('div');
dialogEl.id = 'face-dialog';
dialogEl.style.cssText = [
  'position:fixed;pointer-events:none;z-index:1000;',
  'display:none;',
  'background:#000;',
  'border:1px solid rgba(255,255,255,0.12);',
  'border-radius:0;',
  'padding:16px 20px;',
  'width: min(85vw, 620px);',
  'box-shadow:0 8px 30px rgba(0,0,0,0.5),0 0 12px rgba(255,255,255,0.06);',
  'opacity:0;',
  'transition:opacity 0.6s ease, transform 0.6s ease;',
  'transform:translateY(-20px);',
].join('');
document.body.appendChild(dialogEl);

// Dialog text
// Dialog title (styled like prompt box)
const dialogTitle = document.createElement('div');
dialogTitle.style.cssText = [
  'font:12px Consolas,"Courier New",monospace;',
  'font-style:italic;',
  'color:rgb(220,210,120);',
  'margin-bottom:12px;',
  'text-transform:uppercase;',
  'letter-spacing:1px;',
  'text-shadow:0 0 8px rgba(0,0,0,0.9);',
].join('');
dialogTitle.textContent = '> ESPEJO IA';
dialogEl.appendChild(dialogTitle);

// Dialog text
const dialogContent = document.createElement('div');
dialogContent.style.cssText = [
  'font:22px Consolas,"Courier New",monospace;',
  'color:rgba(210,220,240,0.85);',
  'line-height:1.5;',
  'white-space:pre-wrap;',
  'text-shadow:0 0 8px rgba(0,0,0,0.9);',
].join('');
dialogEl.appendChild(dialogContent);
// Dialog content entrance animation
const dialogAnimStyle = document.createElement('style');
dialogAnimStyle.textContent = `
@keyframes dialogContentIn {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;
document.head.appendChild(dialogAnimStyle);
// Hint inside dialog box (appears after text is done)
const dialogHint = document.createElement('div');
dialogHint.id = 'dialog-hint-inside';
dialogHint.style.cssText = [
  'display:block;',
  'margin-top:14px;',
  'padding-top:12px;',
  'border-top:1px solid rgba(255,255,255,0.15);',
  'font:18px Consolas,"Courier New",monospace;',
  'font-style:italic;',
  'color:rgb(220,210,120);',
  'text-shadow:0 0 12px rgba(0,0,0,0.95);',
].join('');
dialogHint.innerHTML = WELCOME_HINT + ' ' + WAVE_SVG;
dialogEl.appendChild(dialogHint);
// RGB ghosts for dialog box
const dialogGhosts: HTMLDivElement[] = ['#ff0000','#00ff00','#0000ff'].map(color => {
  const g = document.createElement('div');
  g.style.cssText = [
    'position:absolute;top:-1px;left:-1px;right:-1px;bottom:-1px;',
    'border:1px solid ' + color + ';',
    'pointer-events:none;opacity:0.25;mix-blend-mode:screen;',
  ].join('');
  dialogEl.appendChild(g);
  return g;
});

// ─── Hint text (below dialog, tells user to wave) ─────────────
const hintEl = document.createElement('div');
hintEl.id = 'dialog-hint';
hintEl.style.cssText = [
  'position:fixed;pointer-events:none;z-index:1000;',
  'font:13px Consolas,"Courier New",monospace;',
  'font-style:italic;',
  'text-transform:uppercase;',
  'letter-spacing:1px;',
  'color:rgba(140,160,190,0.45);',
  'text-shadow:0 0 8px rgba(0,0,0,0.9);',
  'display:none;',
].join('');
document.body.appendChild(hintEl);
let dialogAllShown = false;

// ─── Debug: encuadre mode (URL param ?encuadre) ──────────────
const ENCUADRE_DEBUG = window.location.search.includes('encuadre');
let encuadreActive = false;
let encuadreOvalW = 0;

// ─── Encuadre oval overlay ────────────────────────────────────
let encuadreOvalH = 0;
let encuadrePhase: 'position' | 'aligned' | 'countdown' = 'position';
let encuadreCountdownValue = 0;
let encuadreCountdownTimer = 0;
let encuadreAlignedTimer = 0;
let encuadreTypingText = '';
let encuadreTypingChars = 0;
let encuadreCapturing = false; // guard against double capture

// ─── Encuadre oval overlay ────────────────────────────────────
const ovalEl = document.createElement('div');
ovalEl.id = 'encuadre-oval';
ovalEl.style.cssText = 'position:fixed;pointer-events:none;z-index:998;border-radius:50%;display:none';
document.body.appendChild(ovalEl);

// ─── Face tracking oval (subtle, follows face) ────────────────
const ovalContainer = document.createElement('div');
ovalContainer.id = 'face-oval-container';
ovalContainer.style.cssText = 'position:fixed;pointer-events:none;z-index:996;display:none';
const faceOvalEl = document.createElement('div');
faceOvalEl.id = 'face-oval';
faceOvalEl.style.cssText = 'position:relative;width:100%;height:100%;border:1px solid rgba(255,255,255,0.35);border-radius:50%;box-shadow:0 0 15px rgba(255,255,255,0.1)';
ovalContainer.appendChild(faceOvalEl);
// RGB ghost ovals — absolute inside container like prompt box style
const ovalGhosts: HTMLDivElement[] = ['#ff0000','#00ff00','#0000ff'].map(color => {
  const g = document.createElement('div');
  g.style.cssText = 'position:absolute;top:-1px;left:-1px;right:-1px;bottom:-1px;border:1px solid ' + color + ';border-radius:50%;pointer-events:none;opacity:0.25;mix-blend-mode:screen';
  ovalContainer.appendChild(g);
  return g;
});
document.body.appendChild(ovalContainer);

// ─── Capture square guide (soft dashed, marks generation crop) ─
const captureGuideEl = document.createElement('div');
captureGuideEl.id = 'capture-guide';
captureGuideEl.style.cssText = 'position:fixed;pointer-events:none;z-index:997;border:1.5px dashed rgba(255,255,255,0.25);display:none;box-shadow:0 0 20px rgba(255,255,255,0.05)';
document.body.appendChild(captureGuideEl);

// ─── Glitch timer for box/oval ghosts ─────────────────────────
let boxGlitchTimer = 0;

const encuadreTextEl = document.createElement('div');
encuadreTextEl.id = 'encuadre-text';
encuadreTextEl.style.cssText = [
  'position:fixed;pointer-events:none;z-index:1000;',
  'font:20px Consolas,"Courier New",monospace;',
  'font-style:italic;',
  'text-transform:uppercase;',
  'letter-spacing:2px;',
  'color:rgba(230,235,245,0.9);',
  'text-shadow:0 0 20px rgba(0,0,0,0.5), 0 0 4px rgba(0,0,0,0.8);',
  'white-space:nowrap;',
  'display:none;text-align:center;width:100%;left:0',
].join('');
document.body.appendChild(encuadreTextEl);

// Encuadre hint (dynamic position guidance below main text)
const encuadreHintEl = document.createElement('div');
encuadreHintEl.id = 'encuadre-hint';
encuadreHintEl.style.cssText = [
  'position:fixed;pointer-events:none;z-index:1000;',
  'font:16px Consolas,"Courier New",monospace;',
  'font-style:italic;',
  'color:rgb(220,210,120);',
  'text-shadow:0 0 20px rgba(0,0,0,0.5), 0 0 4px rgba(0,0,0,0.8);',
  'white-space:nowrap;',
  'display:none;text-align:center;width:100%;left:0;',
  'transition:opacity 0.3s ease;',
].join('');
document.body.appendChild(encuadreHintEl);

// ─── Encuadre countdown (above oval) ──────────────────────────
const countdownEl = document.createElement('div');
countdownEl.id = 'encuadre-countdown';
countdownEl.style.cssText = 'position:fixed;pointer-events:none;z-index:1001;font:bold 320px Consolas,"Courier New",monospace;color:#000;text-shadow:0 0 60px rgba(255,255,255,0.5);display:none;text-align:center;width:100%;left:0';
document.body.appendChild(countdownEl);

// ─── Camera indicator (left side, near camera) ──
const camArrowEl = document.createElement('div');
camArrowEl.id = 'encuadre-arrow';
camArrowEl.style.cssText = 'position:fixed;pointer-events:none;z-index:1000;display:none;font:22px/1.3 Consolas,"Courier New",monospace;text-shadow:0 0 20px rgba(0,0,0,0.9);white-space:nowrap;transform:translateY(-50%)';
camArrowEl.innerHTML = '<span style="font-size:32px">◀</span> <span style="font-size:26px">mirá la<br><span style="padding-left:30px">cámara</span></span>';
document.body.appendChild(camArrowEl);

// ─── Bright overlay (outside oval only) ───────────────────────
const brightEl = document.createElement('div');
brightEl.id = 'encuadre-bright';
brightEl.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,225,190,0.45);pointer-events:none;z-index:997;display:none';
document.body.appendChild(brightEl);

// ─── Flash overlay (full white for capture) ───────────────────
const flashEl = document.createElement('div');
flashEl.id = 'encuadre-flash';
flashEl.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,210,170,0.5);pointer-events:none;z-index:1002;display:none;opacity:0;transition:opacity 0.5s ease';
document.body.appendChild(flashEl);

function enterEncuadre() {
  encuadreActive = true;
  dialogActive = false;
  dialogEl.style.display = 'none';
  hintEl.style.display = 'none';
  // Signal orchestrator to advance to CAPTURA
  wsClient.send({ type: 'continue' });
  // Face-sized oval guide — bigger for better framing
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const ovalH = vh * 0.44;
  const ovalW = ovalH * 0.72;
  encuadreOvalW = ovalW;
  encuadreOvalH = ovalH;
  const targetX = (vw - ovalW) / 2;
  const targetY = (vh - ovalH) / 2 - vh * 0.04;
  // Animate the face box to centered oval guide
  boxEl.style.transition = 'all 1.2s cubic-bezier(0.4, 0, 0.2, 1)';
  boxEl.style.borderRadius = '50%';
  boxEl.style.border = '3px solid rgba(255,255,255,0.6)';
  boxEl.style.boxShadow = '0 0 40px rgba(255,255,255,0.25), inset 0 0 40px rgba(255,255,255,0.06)';
  boxContainer.style.left = targetX + 'px';
  boxContainer.style.top = targetY + 'px';
  boxContainer.style.width = ovalW + 'px';
  boxContainer.style.height = ovalH + 'px';
  // Ghosts follow automatically (absolute inside container)
  for (const g of boxGhosts) {
    g.style.transition = 'all 1.2s cubic-bezier(0.4, 0, 0.2, 1)';
    g.style.borderRadius = '50%';
  }
  // After animation: show backdrop, instruction, enable face oval tracking
  setTimeout(() => {
    boxEl.style.transition = 'none';
    // Semi-transparent backdrop with oval cutout matching exactly
    if (!document.getElementById('encuadre-backdrop')) {
      const cx = (targetX + ovalW / 2) / vw * 100;
      const cy = (targetY + ovalH / 2) / vh * 100;
      const rx = ovalW / vw * 50;
      const ry = ovalH / vh * 50;
      const backdrop = document.createElement('div');
      backdrop.id = 'encuadre-backdrop';
      backdrop.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.55);pointer-events:none;z-index:995;display:block;-webkit-mask-image:radial-gradient(ellipse ${rx}% ${ry}% at ${cx}% ${cy}%, transparent 0%, transparent 98%, black 100%)`;
      document.body.appendChild(backdrop);
    }
    // Square capture guide (dashed, centered same as oval, slightly larger)
    const guideSize = ovalH;
    captureGuideEl.style.display = 'block';
    captureGuideEl.style.left = (targetX + ovalW / 2 - guideSize / 2) + 'px';
    captureGuideEl.style.top = (targetY + ovalH / 2 - guideSize / 2) + 'px';
    captureGuideEl.style.width = guideSize + 'px';
    captureGuideEl.style.height = guideSize + 'px';
    // Instruction text will be typed by animation loop
    encuadreTextEl.style.display = 'block';
    encuadreTextEl.style.top = (targetY + ovalH + 20) + 'px';
    encuadreTypingText = '';
    encuadreTypingChars = 0;
    // Show face tracking oval
    faceOvalEl.style.display = 'block';
  }, 1400);
}

let dialogActive = false;
let dialogFullText = '';
let dialogCleanText = '';
let dialogWavePending = false;
let encuadrePending = false;
let waitingSpinnerTick = 0;
let dialogFadeTimer = 0;
let dialogCooldown = 0;
let dialogIndex = 0;
let hintFlashTimer = 0;
let dialogAutoTimer = 0;
let dialogAbsenceTimer = 0; // seconds before dialog resets on face loss
let dialogAutoAdvanceSet = false;

// ─── Face tracker (smooths detection data) ────────────────────
const faceTracker = new FaceTracker();

// Skip all dialogs in debug mode
if (ENCUADRE_DEBUG) {
  setTimeout(() => enterEncuadre(), 500);
}

// ─── Debug: LECTURA mode (URL param ?lectura) ────────────────
const LECTURA_DEBUG = window.location.search.includes('lectura');
let debugPhotoImg: HTMLImageElement | null = null;
if (LECTURA_DEBUG) {
  const debugImg = new Image();
  debugImg.onload = () => {
    debugPhotoImg = debugImg;
    const checkReady = setInterval(() => {
      if (lecturaLayersReady) {
        clearInterval(checkReady);
        enterLectura();
      }
    }, 100);
  };
  debugImg.onerror = () => console.warn('Debug photo not found at /debug-photo.jpg');
  debugImg.src = '/debug-photo.jpg';
}

// ─── WebSocket — connect to orchestrator ──────────────────────
const wsClient = new WsClient('ws://localhost:3000');
wsClient.onMessage = (data) => {
  if (data.type === 'face_tracking' && typeof data.x === 'number') {
    faceTracker.updateFromDetection(
      new THREE.Vector2(data.x as number, data.y as number),
      data.width as number,
      data.height as number,
    );
    faceTracker.hasFace = data.present as boolean;
  }
  if (data.type === 'presence') {
    faceTracker.hasFace = data.value as boolean;
  }
  if (data.type === 'gesture_detected') {
    dialogWavePending = true;
  }
  if (data.type === 'state') {
    if (data.state === 'CONGELADO') {
      // Photo captured — hide encuadre UI, keep flash visible
      encuadreActive = false;
      dialogEl.style.display = 'none';
      hintEl.style.display = 'none';
      boxContainer.style.display = 'none';
      ovalContainer.style.display = 'none';
      encuadreTextEl.style.display = 'none';
      encuadreHintEl.style.display = 'none';
      camArrowEl.style.display = 'none';
      captureGuideEl.style.display = 'none';
      const backdrop = document.getElementById('encuadre-backdrop');
      if (backdrop) backdrop.style.display = 'none';
      const oval = document.getElementById('encuadre-oval');
      if (oval) oval.style.display = 'none';
      const countdown = document.getElementById('encuadre-countdown');
      if (countdown) countdown.style.display = 'none';
      statusEl.style.display = 'none';
    }
    if (data.state === 'LECTURA' && appState !== 'lectura') {
      enterLectura();
    } else if (data.state === 'REPOSO' && appState === 'lectura' && !LECTURA_DEBUG) {
      leaveLectura();
    } else if (data.state === 'REPOSO' && appState === 'reposo') {
      // Hide welcome dialog when returning to REPOSO
      dialogActive = false;
      dialogAllShown = false;
      dialogWavePending = false;
      encuadrePending = false;
      dialogEl.style.display = 'none';
      dialogEl.style.opacity = '0';
      hintEl.style.display = 'none';
    }
    if (data.state === 'ESPEJO_ACTIVO') {
      // Live face-swapped reflection
      espejoActive = true;
      clearRevealStage();
      swapImgEl.style.display = 'block';
    } else if (espejoActive) {
      espejoActive = false;
      swapImgEl.style.display = 'none';
    }
    // For GENERACION+ states, stay in LECTURA visuals — don't revert to REPOSO
    if ((data.state === 'GENERACION' || data.state === 'REVELACION' || data.state === 'ESPEJO_ACTIVO') && appState === 'lectura') {
      // Keep photo, thinking box, and text visible
      // Face-assembly wireframes stop being updated naturally in the animation loop
    }
  }
  if (data.type === 'swap_frame' && typeof data.image_b64 === 'string') {
    // image_b64 llega SIN el prefijo data: — el navegador lo trataría como URL gigante (431)
    swapImgEl.src = `data:image/jpeg;base64,${data.image_b64}`;
  }
  if (data.type === 'photo_captured') {
    capturedPhotoBase64 = `data:image/png;base64,${data.image_b64}`;
  }
  if (data.type === 'final_portrait') {
    finalPortraitBase64 = data.image_b64 as string;
  }
  if (data.type === 'gen_preview' && typeof data.image_b64 === 'string' && data.image_b64.length > 0) {
    // Buffer denoise progression (noise → final) for the reveal — don't spoil the prompt/canny
    genPreviewSteps.push(data.image_b64 as string);
  }
  if (data.type === 'canny_ready') {
    cannyEdgeBase64 = data.image_b64 as string; // already includes data:image/png;base64, from orchestrator
    // Replace face snapshot textures with canny edge
    applyCannyToFaceSnapshots();
    if (waitingForCannyMorph) {
      waitingForCannyMorph = false;
      postWavePhase = 'contours_done';
      const st5 = document.getElementById('lectura-status-main');
      if (st5) st5.textContent = '> Enviando contornos y prompt...';
      const stSub2 = document.getElementById('lectura-status-sub');
      if (stSub2) stSub2.textContent = '> Contornos recibidos ✓';
      doCannyMorph();
    }
  }
  if (data.type === 'stream_chunk') {
    const ch = data.channel as string;
    const delta = data.text_delta as string;
    const done = data.done as boolean;

    // Always process in lectura state — box DOM exists from module init
    if (appState === 'lectura') {
      processStreamChunk(ch, delta, done);
    } else if (!document.getElementById('lectura-thinking')?.style.display || document.getElementById('lectura-thinking')!.style.display === 'none') {
      // If not in lectura and box hidden, buffer the chunk
      pendingChunks.push({ channel: ch, delta, done });
    } else {
      processStreamChunk(ch, delta, done);
    }
  }
};

// ─── Process a stream_chunk into the thinking box ─────────────
function processStreamChunk(ch: string, delta: string, done: boolean) {
  // thinking_es: track completion
  if (ch === 'thinking_es') {
    if (streamPhase === 'idle' && !done) {
      streamPhase = 'thinking';
    }
    if (done && streamPhase === 'thinking') {
      streamPhase = 'descripcion';
    }
    return;
  }

  // descripcion: structured description (streamed, shown in box)
  if (ch === 'descripcion') {
    if (streamPhase === 'idle' || streamPhase === 'descripcion' || streamPhase === 'thinking') {
      if (streamPhase === 'idle' || streamPhase === 'thinking') {
        streamPhase = 'descripcion';
        lecturaThinking.show();
        const st3 = document.getElementById('lectura-status-main');
        if (st3) st3.textContent = '> Descripción recibida';
      }
      if (delta) {
        lecturaThinking.showDescription(delta);
        descriptionBuffer += delta;
      }
      if (done) {
        streamPhase = 'done';
        storedDescription = descriptionBuffer;
        // Reset wave flag so old waves don't carry over
        dialogWavePending = false;
        // Start floating description sprites immediately
        createDescriptionSprites(storedDescription);
        waitingDescWave = true;
        // Minimum 1.5s before accepting wave so user sees the message
        descWaveReadyTimer = 1.5;
        // If prompt_es already arrived, show wave message; otherwise keep "generating" text
        const st = document.getElementById('lectura-status-main');
        if (st) {
          if (promptESReady) {
            st.innerHTML = '> Saludá con la mano para continuar ' + WAVE_SVG;
          } else {
            st.textContent = '> Descripción lista. Generando prompt...';
          }
        }
      }
    }
    return;
  }

  // Capture prompt_es content
  if (ch === 'prompt_es') {
    if (delta) storedPromptES += delta;
    if (done) {
      console.log(`prompt_es complete: ${storedPromptES.length} chars, ends with: "${storedPromptES.slice(-50)}"`);
      promptESReady = true;
      // Update status if descripcion is also ready
      if (waitingDescWave || streamPhase === 'done') {
        const st = document.getElementById('lectura-status-main');
        if (st) st.innerHTML = '> Saludá con la mano para continuar ' + WAVE_SVG;
      }
      // If descripcion hasn't finished yet, defer prompt box
      if (streamPhase !== 'done') {
        promptESDeferred = true;
      }
    }
    return;
  }
  // Ignore prompt_en for display (used internally)
  if (ch === 'prompt_en') {
    return;
  }
}

// Morph the captured photo into the canny edge contours
function doCannyMorph() {
  waitingForCannyMorph = false;
  if (analysisHUD && cannyEdgeBase64) {
    const img = new Image();
    img.onload = () => {
      // CSS already mirrors (transform: scaleX(-1) on imgEl), pass raw
      // Smooth cross-fade: fade out, swap, fade in
      const photoOuter = document.getElementById('lectura-photo');
      if (photoOuter) {
        photoOuter.style.transition = 'opacity 0.3s ease';
        photoOuter.style.opacity = '0';
        setTimeout(() => {
          analysisHUD!.setPhoto(img);
          photoOuter.style.opacity = '1';
          setTimeout(() => { photoOuter.style.transition = ''; }, 350);
        }, 350);
      } else {
        analysisHUD!.setPhoto(img);
      }
      // Brief flash pulse via reveal mesh
      revealMeshObj.trigger();
    };
    img.src = cannyEdgeBase64;
  }
  const st5 = document.getElementById('lectura-status-main');
  if (st5) st5.textContent = '> Enviando contornos y prompt...';
}
wsClient.connect();
// Handle binary camera frames from vision service (via orchestrator)
wsClient.onBinary = (blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => { pendingFrame = img; URL.revokeObjectURL(url); };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
};

// ─── Animation loop ───────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  const dt = clock.getDelta();
  const time = clock.getElapsedTime();

  uniforms.uTime.value = time;

  // Camera breathes — subtle movement like floating inside
  camera.position.x = Math.sin(time * 0.008) * 0.06;
  camera.position.y = Math.cos(time * 0.012) * 0.05 + 0.02;
  camera.position.z = Math.sin(time * 0.015) * 0.04;
  camera.lookAt(
    Math.sin(time * 0.005) * 0.1,
    Math.cos(time * 0.007) * 0.08,
    -2,
  );

  // ── Animate particles ──
  const posArr = particles.geometry.attributes.position.array as Float32Array;
  for (let i = 0; i < particleCount; i++) {
    posArr[i * 3] += Math.sin(time * 0.002 + i) * 0.00002;
    posArr[i * 3 + 1] += Math.cos(time * 0.0015 + i * 1.3) * 0.00002;
  }
  particles.geometry.attributes.position.needsUpdate = true;
  particleMat.opacity = 0.3 + Math.sin(time * 0.005) * 0.1;

  // ── Animate teal particles ──
  const posArr2 = particles2.geometry.attributes.position.array as Float32Array;
  for (let i = 0; i < particleCount2; i++) {
    posArr2[i * 3] += Math.cos(time * 0.003 + i * 0.7) * 0.00003;
    posArr2[i * 3 + 1] += Math.sin(time * 0.0025 + i * 0.9) * 0.00003;
  }
  particles2.geometry.attributes.position.needsUpdate = true;
  pMat2.opacity = 0.15 + Math.sin(time * 0.004 + 1) * 0.1;

  // ── Update nebula layers ──
  for (const nu of nebulaUniformsList) { nu.uTime.value = time; }

  // ── Update grid opacity with depth ──
  gridMat.opacity = 0.02 + Math.sin(time * 0.003) * 0.02;

  // ── Update code snippets (hidden during LECTURA) ──
  for (const cs of codeSnippets) {
    if (appState === 'lectura') {
      (cs.sprite.material as THREE.SpriteMaterial).opacity = 0;
      (cs.ghost.material as THREE.SpriteMaterial).opacity = 0;
      continue;
    }
    if (cs.state === 'typing') {
      cs.visibleChars += cs.charSpeed * dt * 30;
      if (cs.visibleChars >= cs.fullText.length) {
        cs.visibleChars = cs.fullText.length;
        cs.state = 'display';
      }
      const progress = cs.visibleChars / cs.fullText.length;
      const tex = cs.isBias
        ? makeBiasTexture(cs.fullText, progress)
        : makeCodeTexture(cs.fullText, progress);
      (cs.sprite.material as THREE.SpriteMaterial).map = tex;
      (cs.sprite.material as THREE.SpriteMaterial).needsUpdate = true;
      (cs.ghost.material as THREE.SpriteMaterial).map = tex;
      (cs.ghost.material as THREE.SpriteMaterial).needsUpdate = true;
      cs.sprite.material.opacity = 0.6;
    } else if (cs.state === 'display') {
      cs.life += 0.001;
      if (cs.life > 1) cs.state = 'fading';
      const op = 0.6 * (1 - cs.life * 0.2);
      cs.sprite.material.opacity = op;
      cs.ghost.material.opacity = op * 0.3;
    } else if (cs.state === 'fading') {
      cs.life += 0.003;
      const op = 0.6 * (1 - cs.life);
      cs.sprite.material.opacity = op;
      cs.ghost.material.opacity = op * 0.2;
      if (cs.life >= 1) {
        cs.life = 0;
        cs.state = 'typing';
        cs.visibleChars = 0;
        cs.fullText = cs.isBias
          ? biasLines[Math.floor(Math.random() * biasLines.length)]
          : codeLines[Math.floor(Math.random() * codeLines.length)];
        const zDepth = -0.5 - Math.random() * 6;
        const spread2 = -zDepth * (0.1 + Math.random() * 0.5);
        const angle2 = Math.random() * Math.PI * 2;
        cs.basePos.set(
          Math.cos(angle2) * spread2,
          Math.sin(angle2) * spread2 * 0.6,
          zDepth,
        );
      }
    }
    // Subtle drift
    cs.basePos.x += Math.sin(time * 0.001 + cs.phase) * 0.0001;
    cs.basePos.y += Math.cos(time * 0.0012 + cs.phase * 0.7) * 0.0001;
    cs.group.position.copy(cs.basePos);

    // RGB glitch — solo el ghost, el texto principal blanco
    cs.ghostGlitch -= 0.005;
    const sMat = cs.sprite.material as THREE.SpriteMaterial;
    const gMat = cs.ghost.material as THREE.SpriteMaterial;
    sMat.color.set(0xffffff);
    if (cs.ghostGlitch <= 0) {
      gMat.color.copy(_glitchRGB[Math.floor(Math.random() * 3)]);
      cs.ghost.position.set(0.012 + (Math.random()-0.5)*0.015, (Math.random()-0.5)*0.01, 0);
      cs.ghostGlitch = 0.04 + Math.random() * 0.08;
    }
    // Recover ghost to white
    gMat.color.r += (1.0 - gMat.color.r) * 0.15;
    gMat.color.g += (1.0 - gMat.color.g) * 0.15;
    gMat.color.b += (1.0 - gMat.color.b) * 0.15;
    cs.ghost.position.x += (0.005 - cs.ghost.position.x) * 0.08;
    cs.ghost.position.y += (0 - cs.ghost.position.y) * 0.08;
  }

  // ── Update data flickers ──
  // Each point blinks with its own rhythm, creating a data-stream feel
  let totalVis = 0;
  for (let i = 0; i < flickerCount; i++) {
    const t = time * flickerSpeed[i] + flickerPhase[i];
    const val = Math.sin(t);
    // Sharp on/off with some hold time
    if (val > 0.7) totalVis++;
  }
  fMat.opacity = (totalVis / flickerCount) * 0.5;

  // ── Update connection lines ──
  const connPos = connLines.geometry.attributes.position.array as Float32Array;
  for (let i = 0; i < connectionPairs.length; i++) {
    const [a, b] = connectionPairs[i];
    connPos[i * 6] = posArr[a * 3];
    connPos[i * 6 + 1] = posArr[a * 3 + 1];
    connPos[i * 6 + 2] = posArr[a * 3 + 2];
    connPos[i * 6 + 3] = posArr[b * 3];
    connPos[i * 6 + 4] = posArr[b * 3 + 1];
    connPos[i * 6 + 5] = posArr[b * 3 + 2];
  }
  connLines.geometry.attributes.position.needsUpdate = true;

  // ── Light bursts ──
  for (const b of bursts) {
    b.progress += 0.003 * b.speed;
    if (b.progress > 1) b.progress = 0;
    const eased = Math.sin(b.progress * Math.PI);
    b.sprite.material.opacity = eased * 0.3;
    const zDepth = -1 - b.progress * 8;
    const spread = -zDepth * 0.4;
    b.sprite.position.set(
      Math.cos(b.angle + time * 0.01) * spread,
      Math.sin(b.angle * 0.7 + time * 0.008) * spread * 0.6,
      zDepth,
    );
    b.sprite.scale.set(0.3 + eased * 0.4, 0.3 + eased * 0.4, 1);
  }

  // Update text sprites
  for (const ws of wordSprites) {
    if (ws.state === 'rising') {
      ws.life += ws.lifeSpeed;
      if (ws.life >= 1) ws.state = 'falling';
    } else {
      ws.life -= ws.lifeSpeed * 0.5;
      if (ws.life <= 0) {
        ws.life = 0;
        ws.state = 'rising';

        // Respawn across the full frustum
        const zDepth = -0.2 - Math.random() * 10;
        const spread = -zDepth * (0.3 + Math.random() * 1.0);
        const angle = Math.random() * Math.PI * 2;
        ws.basePos.set(
          Math.cos(angle) * spread,
          Math.sin(angle) * spread * 0.7,
          zDepth,
        );

        const newText = wordList[Math.floor(Math.random() * wordList.length)];
        const newColorIdx = Math.floor(Math.random() * 10);
        (ws.sprite.material as THREE.SpriteMaterial).map = makeTextTexture(newText, Math.floor(Math.random() * 4), newColorIdx);
        (ws.sprite.material as THREE.SpriteMaterial).needsUpdate = true;
      }
    }

    // ── Occasional drift nudge ──
    ws.glitchTimer -= 0.01;
    const wsMat = ws.sprite.material as THREE.SpriteMaterial;

    if (ws.glitchTimer <= 0) {
      const type = Math.random();
      if (type < 0.5) {
        ws.glitchOffset.set(
          (Math.random() - 0.5) * 0.015,
          (Math.random() - 0.5) * 0.015,
          0,
        );
      } else {
        wsMat.opacity = 0;
        ws.glitchTimer = 0.06;
      }
      ws.glitchTimer = 6 + Math.random() * 10;
    }

    wsMat.color.set(0xffffff);
    ws.glitchOffset.multiplyScalar(0.95);

    const breathe = 0.7 + 0.3 * Math.sin(time * 0.002 + ws.phase * 2.0);
    ws.sprite.material.opacity = ws.life * 0.30 * breathe;

    // Drift through space
    ws.basePos.x += Math.sin(time * 0.003 + ws.phase) * 0.0003 * dt * 60;
    ws.basePos.y += Math.cos(time * 0.004 + ws.phase * 1.3) * 0.00025 * dt * 60;
    ws.basePos.z += Math.sin(time * 0.002 + ws.phase * 0.7) * 0.0002 * dt * 60;

    ws.sprite.position.copy(ws.basePos).add(ws.glitchOffset);
  }

  // Update face fragments
  if (faceFragments) {
    faceFragments.update(time);
  }

  // ── LECTURA state updates ──
  if (appState === 'lectura') {
    try {
      revealMeshObj.updateReveal(dt);
      if (faceAssembly) faceAssembly.update(time);
      if (analysisHUD) analysisHUD.update(time, dt);

      lecturaThinking.update(dt);
      promptBox.update(time, dt);

      // Countdown timer for description generation (starts immediately on entering LECTURA)
      if (streamPhase !== 'done') {
        descCountdown -= dt;
        const stSub = document.getElementById('lectura-status-sub');
        if (stSub && descCountdown > 0) {
          stSub.textContent = `> Tiempo restante estimado: ${Math.ceil(descCountdown)}s`;
        } else if (stSub && descCountdown <= 0 && stSub.textContent.includes('Tiempo restante')) {
          stSub.textContent = '> Capturando los últimos detalles...';
        }
      } else {
        // Description complete — update subtitle once
        const stSub = document.getElementById('lectura-status-sub');
        if (stSub && (stSub.textContent.includes('Tiempo restante') || stSub.textContent.includes('Capturando'))) {
          stSub.textContent = '> Descripción completada ✓';
        }
      }

      // Show/hide the wave hint box below the description
      const waveHintEl = document.getElementById('lectura-wave-hint');
      if (waveHintEl) {
        waveHintEl.style.display = (waitingDescWave && promptESReady) ? 'block' : 'none';
      }

      // Wave advances from description-read state (with min timer)
      if (descWaveReadyTimer > 0) descWaveReadyTimer -= dt;
      if (waitingDescWave && dialogWavePending && descWaveReadyTimer <= 0) {
        dialogWavePending = false;
        waitingDescWave = false;
        // Show "Saludo detectado" feedback
        const stWave = document.getElementById('lectura-status-main');
        if (stWave) {
          stWave.innerHTML = CHECK_SVG + 'Saludo detectado';
          stWave.style.color = '#4ade80';
        }
        lecturaThinking.hide();
        // Start prompt countdown phase after brief delay
        setTimeout(() => {
          const st2 = document.getElementById('lectura-status-main');
          if (st2) { st2.textContent = '> Generando prompt...'; st2.style.color = 'rgb(220,210,120)'; }
          postWavePhase = 'prompt_countdown';
          postWaveTimer = 2;
        }, 600);
      }

      // Post-wave phase progression
      if (postWavePhase === 'prompt_countdown') {
        postWaveTimer -= dt;
        const stSub = document.getElementById('lectura-status-sub');
        if (stSub) stSub.textContent = `> Tiempo restante: ${Math.ceil(postWaveTimer)}s`;
        if (postWaveTimer <= 0) {
          postWavePhase = 'prompt_done';
          postWaveTimer = 2;
          const st3 = document.getElementById('lectura-status-main');
          if (st3) { st3.textContent = '> Prompt completado ✓'; st3.style.color = '#4ade80'; }
          // Show prompt box now
          if (storedPromptES) { promptBox.show(storedPromptES); promptShownAt = time; }
          if (promptESDeferred) { promptESDeferred = false; }
        }
      } else if (postWavePhase === 'prompt_done') {
        postWaveTimer -= dt;
        const stSub = document.getElementById('lectura-status-sub');
        if (stSub) stSub.textContent = `> Mostrando prompt — ${Math.ceil(postWaveTimer)}s`;
        if (postWaveTimer <= 0) {
          postWavePhase = 'contours_countdown';
          postWaveTimer = 5; // min hold before showing contours
          const st4 = document.getElementById('lectura-status-main');
          if (st4) { st4.textContent = '> Generando contornos de la cara...'; st4.style.color = 'rgb(220,210,120)'; }
          waitingForCannyMorph = false;
        }
      } else if (postWavePhase === 'contours_countdown') {
        postWaveTimer -= dt;
        const stSub = document.getElementById('lectura-status-sub');
        if (stSub) {
          if (postWaveTimer > 0) stSub.textContent = `> Tiempo estimado: ${Math.ceil(postWaveTimer)}s`;
          else if (!cannyEdgeBase64) stSub.textContent = '> Esperando contornos...';
        }
        if (postWaveTimer <= 0) {
          if (cannyEdgeBase64) {
            postWavePhase = 'contours_done';
            const st5 = document.getElementById('lectura-status-main');
            if (st5) st5.textContent = '> Enviando contornos y prompt...';
            const stSub2 = document.getElementById('lectura-status-sub');
            if (stSub2) stSub2.textContent = '> Contornos recibidos ✓';
            doCannyMorph();
          } else {
            // Canny not ready yet — morph as soon as it arrives
            waitingForCannyMorph = true;
          }
        }
      }

      // Prompt wave hint — show below prompt box ONLY when the portrait is actually ready,
      // and only before the reveal/espejo (otherwise a later wave would re-trigger the reveal)
      const pwh = document.getElementById('prompt-wave-hint');
      if (pwh) {
        if (!promptWaveHintShown && promptShownAt >= 0 && finalPortraitBase64 !== null && !revealActive && !espejoActive) {
          promptWaveHintShown = true;
          pwh.style.display = 'block';
        }
        // Wave advances from prompt-read state → reveal the generated portrait
        if (promptWaveHintShown && dialogWavePending) {
          dialogWavePending = false;
          promptWaveHintShown = false;
          pwh.style.display = 'none';
          doRevealPortrait();
        }
        // After the reveal, a wave starts the live espejo (face swap) —
        // with a short grace so the final reveal is visible first
        if (revealDone && dialogWavePending && (Date.now() - revealDoneAt) > 2000) {
          dialogWavePending = false;
          revealDone = false;
          wsClient.send({ type: 'start_espejo' });
        }
      }
    } catch (err) {
      console.warn('LECTURA update error:', err);
    }
  }

  // ── Question sprites (during thinking phase) ──
  if (appState === 'lectura' && (streamPhase === 'idle' || streamPhase === 'thinking')) {
    if (questionSprites.length < QUESTION_TOTAL && Math.random() < 0.04) {
      spawnQuestionSprite();
    }
  } else if (appState === 'lectura' && streamPhase !== 'idle' && streamPhase !== 'thinking' && questionSprites.length > 0) {
    // Destroy questions when descripcion starts arriving
    destroyQuestionSprites();
  }

  // Update question sprites (same lifecycle as desc sprites)
  for (let i = questionSprites.length - 1; i >= 0; i--) {
    const ds = questionSprites[i];
    ds.life += dt;

    if (ds.state === 'typing') {
      ds.visibleChars = Math.min(ds.text.length, ds.visibleChars + ds.charSpeed * dt * 30);
      const progress = ds.visibleChars / ds.text.length;
      const tex = makeDescTexture(ds.text, progress);
      (ds.sprite.material as THREE.SpriteMaterial).map = tex;
      (ds.sprite.material as THREE.SpriteMaterial).needsUpdate = true;
      (ds.ghost.material as THREE.SpriteMaterial).map = tex;
      (ds.ghost.material as THREE.SpriteMaterial).needsUpdate = true;
      // Dimmer/cyan tint for questions
      ds.sprite.material.opacity = Math.min(0.35, ds.life * 2);
      ds.ghost.material.opacity = ds.sprite.material.opacity * 0.2;
      if (ds.visibleChars >= ds.text.length) ds.state = 'display';
    } else if (ds.state === 'display') {
      if (ds.life > 4 + Math.random() * 3) ds.state = 'fading';
      ds.sprite.material.opacity = 0.35 * (1 - Math.max(0, (ds.life - 4) / 3));
      ds.ghost.material.opacity = ds.sprite.material.opacity * 0.2;
    } else if (ds.state === 'fading') {
      ds.sprite.material.opacity *= 0.95;
      ds.ghost.material.opacity *= 0.95;
      if (ds.sprite.material.opacity < 0.01) {
        scene.remove(ds.sprite); scene.remove(ds.ghost);
        ds.sprite.material.dispose(); ds.ghost.material.dispose();
        questionSprites.splice(i, 1);
        continue;
      }
    }
    // Drift
    ds.basePos.x += ds.vel.x + Math.sin(Date.now() * 0.0003 + ds.phase) * 0.00015;
    ds.basePos.y += ds.vel.y + Math.cos(Date.now() * 0.0004 + ds.phase) * 0.00015;
    ds.sprite.position.copy(ds.basePos);
    ds.ghost.position.copy(ds.basePos);
    ds.ghost.position.x += 0.003;
    ds.ghost.position.y += 0.001;
    // Subtle RGB glitch
    if (Math.random() < 0.005) {
      const gc = [new THREE.Color(1,0,0), new THREE.Color(0,1,0), new THREE.Color(0,0,1)][Math.floor(Math.random() * 3)];
      (ds.ghost.material as THREE.SpriteMaterial).color.copy(gc);
    } else {
      const gm = ds.ghost.material as THREE.SpriteMaterial;
      gm.color.r += (1 - gm.color.r) * 0.06;
      gm.color.g += (1 - gm.color.g) * 0.06;
      gm.color.b += (1 - gm.color.b) * 0.06;
    }
  }

  // ── Description sprites (continuous typing/drifting/fading) ──
  // Spawn new ones periodically
  if (appState === 'lectura' && descLinesPool.length > 0 && descSprites.length < DESC_SPRITE_COUNT) {
    if (Math.random() < 0.02) spawnDescSprite();
  }

  for (let i = descSprites.length - 1; i >= 0; i--) {
    const ds = descSprites[i];
    ds.life += dt;

    if (ds.state === 'typing') {
      ds.visibleChars = Math.min(ds.text.length, ds.visibleChars + ds.charSpeed * dt * 30);
      const progress = ds.visibleChars / ds.text.length;
      const tex = makeDescTexture(ds.text, progress);
      (ds.sprite.material as THREE.SpriteMaterial).map = tex;
      (ds.sprite.material as THREE.SpriteMaterial).needsUpdate = true;
      (ds.ghost.material as THREE.SpriteMaterial).map = tex;
      (ds.ghost.material as THREE.SpriteMaterial).needsUpdate = true;
      ds.sprite.material.opacity = Math.min(0.55, ds.life * 2);
      ds.ghost.material.opacity = ds.sprite.material.opacity * 0.25;
      if (ds.visibleChars >= ds.text.length) {
        ds.state = 'display';
      }
    } else if (ds.state === 'display') {
      if (ds.life > 5 + Math.random() * 4) {
        ds.state = 'fading';
      }
      ds.sprite.material.opacity = 0.55 * (1 - Math.max(0, (ds.life - 5) / 4));
      ds.ghost.material.opacity = ds.sprite.material.opacity * 0.2;
    } else if (ds.state === 'fading') {
      ds.sprite.material.opacity *= 0.97;
      ds.ghost.material.opacity *= 0.97;
      if (ds.sprite.material.opacity < 0.01) {
        scene.remove(ds.sprite); scene.remove(ds.ghost);
        ds.sprite.material.dispose(); ds.ghost.material.dispose();
        descSprites.splice(i, 1);
        continue;
      }
    }

    // Drift
    ds.basePos.x += ds.vel.x + Math.sin(Date.now() * 0.0005 + ds.phase) * 0.0002;
    ds.basePos.y += ds.vel.y + Math.cos(Date.now() * 0.0006 + ds.phase) * 0.0002;
    ds.sprite.position.copy(ds.basePos);
    ds.ghost.position.copy(ds.basePos);
    ds.ghost.position.x += 0.004;
    ds.ghost.position.y += 0.002;
    // Subtle RGB glitch
    if (Math.random() < 0.008) {
      const gc = [new THREE.Color(1,0,0), new THREE.Color(0,1,0), new THREE.Color(0,0,1)][Math.floor(Math.random() * 3)];
      (ds.ghost.material as THREE.SpriteMaterial).color.copy(gc);
    } else {
      const gm = ds.ghost.material as THREE.SpriteMaterial;
      gm.color.r += (1 - gm.color.r) * 0.08;
      gm.color.g += (1 - gm.color.g) * 0.08;
      gm.color.b += (1 - gm.color.b) * 0.08;
    }
  }

  // ── Floating face snapshots (throughout LECTURA) ──
  if (appState === 'lectura' && faceSnapshotTex && !revealActive) {
    if (faceSnapshots.length < FACE_SNAPSHOT_COUNT && Math.random() < 0.06) {
      spawnFaceSnapshot();
    }
  }

  for (let i = faceSnapshots.length - 1; i >= 0; i--) {
    const fs = faceSnapshots[i];
    const fm = fs.mesh.material as THREE.MeshBasicMaterial;
    const fg = fs.ghost.material as THREE.MeshBasicMaterial;
    fs.life += dt;

    if (fs.state === 'rising') {
      fm.opacity = Math.min(0.5, fs.life * 1.2);
      fg.opacity = fm.opacity * 0.3;
      if (fs.life > 2) fs.state = 'drifting';
    } else if (fs.state === 'drifting') {
      if (fs.life > 14 + Math.random() * 8) {
        fs.state = 'fading';
      }
      fm.opacity = 0.5 * (1 - Math.max(0, (fs.life - 14) / 6));
      fg.opacity = fm.opacity * 0.3;
    } else if (fs.state === 'fading') {
      fm.opacity *= 0.96;
      fg.opacity *= 0.96;
      if (fm.opacity < 0.01) {
        scene.remove(fs.mesh); scene.remove(fs.ghost);
        fm.dispose(); fg.dispose();
        faceSnapshots.splice(i, 1);
        continue;
      }
    }

    // Drift in 3D space
    fs.basePos.x += fs.vel.x + Math.sin(Date.now() * 0.0004 + fs.phase) * 0.0003;
    fs.basePos.y += fs.vel.y + Math.cos(Date.now() * 0.0005 + fs.phase) * 0.0003;
    fs.basePos.z += Math.sin(Date.now() * 0.0003 + fs.phase * 0.7) * 0.0002;
    fs.mesh.position.copy(fs.basePos);
    // 3D rotation drift
    fs.mesh.rotation.x += fs.rotSpeed.x * dt * 60;
    fs.mesh.rotation.y += fs.rotSpeed.y * dt * 60;
    fs.mesh.rotation.z += fs.rotSpeed.z * dt * 60;
    fs.ghost.rotation.copy(fs.mesh.rotation);
    // ── Wireframe-style RGB glitch ──
    fs.glitchTimer -= dt;
    if (fs.glitchTimer <= 0) {
      const c = [new THREE.Color(1,0,0), new THREE.Color(0,1,0), new THREE.Color(0,0,1)][Math.floor(Math.random() * 3)];
      fg.color.copy(c);
      fs.ghost.position.set(
        fs.basePos.x + (Math.random() - 0.5) * 0.025,
        fs.basePos.y + (Math.random() - 0.5) * 0.025,
        fs.basePos.z
      );
      fs.glitchTimer = 0.06 + Math.random() * 0.1;
    }
    // Recover ghost color back to gray
    fg.color.r += (0.15 - fg.color.r) * 0.12;
    fg.color.g += (0.15 - fg.color.g) * 0.12;
    fg.color.b += (0.15 - fg.color.b) * 0.12;
    // Ghost follows mesh with smooth blur wobble
    const bOff = Math.sin(Date.now() * 0.001 + fs.phase) * 0.003;
    fs.ghost.position.x += (fs.basePos.x + bOff - fs.ghost.position.x) * 0.05;
    fs.ghost.position.y += (fs.basePos.y + bOff * 0.5 - fs.ghost.position.y) * 0.05;
  }

  // ── Reveal step polaroids (accumulate, drift forever) ──
  for (const sp of stepPolaroids) {
    const sm = sp.mesh.material as THREE.MeshBasicMaterial;
    const sg = sp.ghost.material as THREE.MeshBasicMaterial;
    sp.life += dt;
    sm.opacity = Math.min(0.85, sp.life * 2.5);
    sg.opacity = sm.opacity * 0.3;
    sp.basePos.x += Math.sin(Date.now() * 0.0004 + sp.phase) * 0.0003;
    sp.basePos.y += Math.cos(Date.now() * 0.0005 + sp.phase) * 0.0003;
    sp.mesh.position.copy(sp.basePos);
    sp.mesh.rotation.x += sp.rotSpeed.x * dt * 60;
    sp.mesh.rotation.y += sp.rotSpeed.y * dt * 60;
    sp.mesh.rotation.z += sp.rotSpeed.z * dt * 60;
    sp.ghost.position.copy(sp.mesh.position).add(sp.ghostOffset);
    sp.ghost.rotation.copy(sp.mesh.rotation);
  }

  // ── Draw camera frame to DOM canvas ──
  faceTracker.update(dt);
  if (pendingFrame) {
    lastFrameImg = pendingFrame as HTMLImageElement;
    pendingFrame = null;
  }
  const frameImg = lastFrameImg;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (camCanvas.width !== vw || camCanvas.height !== vh) {
    camCanvas.width = vw;
    camCanvas.height = vh;
  }
  camCtx.clearRect(0, 0, vw, vh);
  // ── Face reveal: camera spreads from face outward (soft edge) ──
  let hasFace = false;
  if (encuadreActive) {
    revealProgress = 1;
    hasFace = true;
  } else {
    hasFace = faceTracker.hasFace && faceTracker.smoothedSize > 0.01;
    if (hasFace) {
      revealProgress = Math.min(1, revealProgress + dt * 2.0);
    } else {
      revealProgress = Math.max(0, revealProgress - dt * 2.5);
    }
  }
  // ── Camera frame to DOM canvas ──
  if (appState === 'lectura') {
    // During LECTURA: consistent baseline (0.3), a touch more during the reveal
    if (frameImg) {
      const camOpacity = revealActive ? '0.4' : '0.3';
      camCanvas.style.maskImage = 'none';
      camCanvas.style.opacity = camOpacity;
      camCtx.clearRect(0, 0, vw, vh);
      camCtx.globalAlpha = parseFloat(camOpacity);
      camCtx.drawImage(frameImg, 0, 0, vw, vh);
      camCtx.globalAlpha = 1.0;
    }
  } else if (frameImg && revealProgress > 0.01) {
      const pct = faceTracker.smoothedPos;
      const px = (pct.x * 100).toFixed(1);
      const py = (pct.y * 100).toFixed(1);
      const r = (revealProgress * 150).toFixed(0);
      const soft = Math.max(10, (revealProgress * 100)).toFixed(0);
      camCanvas.style.maskImage = `radial-gradient(circle ${r}% at ${px}% ${py}%, black 0%, black ${soft}%, transparent ${r}%)`;
      camCanvas.style.opacity = String(Math.min(1, revealProgress * 1.5));
      const p = faceTracker.smoothedPos;
      const fw = faceTracker.smoothedSize;
      const fh = faceTracker.smoothedHeight;
      camCtx.globalAlpha = 0.3;
      camCtx.drawImage(frameImg, 0, 0, vw, vh);
      if (fw > 0.01) {
        const sw2 = frameImg.naturalWidth || 270;
        const sh2 = frameImg.naturalHeight || 480;
        camCtx.globalAlpha = Math.min(1, revealProgress * 2);
        if (encuadreActive) {
          // Encuadre: oval with guide proportion, shifted up
          const faceW = fw * vw;
          const margin = 1.0;
          const bw = faceW * margin;
          const bh = bw / 0.72;
          const bx = p.x * vw - bw / 2;
          const by = p.y * vh - bh / 2 - bh * 0.13;
          const sx = (bx / vw) * sw2;
          const sy = (by / vh) * sh2;
          const sw3 = (bw / vw) * sw2;
          const sh3 = (bh / vh) * sh2;
          camCtx.save();
          camCtx.beginPath();
          camCtx.ellipse(bx + bw / 2, by + bh / 2, bw / 2, bh / 2, 0, 0, Math.PI * 2);
          camCtx.clip();
          camCtx.drawImage(frameImg, sx, sy, sw3, sh3, bx, by, bw, bh);
          camCtx.restore();
        } else {
          // Discover mode: original face box (2x face size, no oval, no shift)
          const bw = fw * vw * 2;
          const bh = fh * vh * 2;
          const bx = p.x * vw - bw / 2;
          const by = p.y * vh - bh / 2;
          const sx = (bx / vw) * sw2;
          const sy = (by / vh) * sh2;
          const sw3 = (bw / vw) * sw2;
          const sh3 = (bh / vh) * sh2;
          camCtx.drawImage(frameImg, sx, sy, sw3, sh3, bx, by, bw, bh);
        }
      }
      camCtx.globalAlpha = 1.0;
    }


  uniforms.uBoxPos.value.copy(faceTracker.smoothedPos);
  uniforms.uBoxSize.value = faceTracker.smoothedSize;
  uniforms.uDisturbance.value = faceTracker.disturbance;
  // Camera feed shader uniforms

  // Update DOM face box position (using actual width & height from tracking)
  const p = faceTracker.smoothedPos;
  const sw = faceTracker.smoothedSize;
  const sh = faceTracker.smoothedHeight;
  if (appState !== 'lectura' && sw > 0.01 && faceTracker.hasFace && !encuadreActive) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const mx = 1 - p.x; // mirror X to match flipped camera canvas
    const boxW = sw * vw * 2;
    const boxH = sh * vh * 2;
    const boxX = mx * vw - boxW / 2;
    const boxY = p.y * vh - boxH / 2;
    boxContainer.style.display = 'block';
    boxContainer.style.left = boxX + 'px';
    boxContainer.style.top = boxY + 'px';
    boxContainer.style.width = boxW + 'px';
    boxContainer.style.height = boxH + 'px';
  } else if (!encuadreActive && appState !== 'lectura') {
    boxContainer.style.display = 'none';
    for (const g of boxGhosts) g.style.display = 'none';
  }

  // ── Encuadre phase logic (alignment, countdown, capture) ──
  if (encuadreActive && encuadreOvalW > 0 && faceTracker.smoothedSize > 0.01) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const centerX = vw / 2;
    const centerY = vh / 2 - vh * 0.04;
    const faceX = p.x * vw;
    const faceY = p.y * vh;
    const dist = Math.hypot(faceX - centerX, faceY - centerY);
    const alignThreshold = encuadreOvalW * 0.25;

    // Face tracking oval — based on MediaPipe face width + margin, same proportion as guide
    const faceW = faceTracker.smoothedSize * vw;
    const margin = 1.0; // 0% extra — tight to MediaPipe face detection
    const faceOvalW = faceW * margin;
    const faceOvalH = faceOvalW / 0.72;

    // Size check: face oval must be similar size to guide oval (tolerance ±25%)
    const sizeRatio = faceOvalW / encuadreOvalW;
    const sizeOk = sizeRatio > 0.92 && sizeRatio < 1.08;
    const mirroredFaceX = vw - faceX;
    const fOx = mirroredFaceX - faceOvalW / 2;
    const fOy = faceY - faceOvalH / 2 - faceOvalH * 0.13; // shift up 13%
    ovalContainer.style.display = 'block';
    ovalContainer.style.left = fOx + 'px';
    ovalContainer.style.top = fOy + 'px';
    ovalContainer.style.width = faceOvalW + 'px';
    ovalContainer.style.height = faceOvalH + 'px';

    if (encuadrePhase === 'position') {
      // Restore camera instruction text
      camArrowEl.innerHTML = '<span style="font-size:32px">◀</span> <span style="font-size:26px">mirá la<br><span style="padding-left:30px">cámara</span></span>';
      camArrowEl.style.display = 'none';
      encuadreTextEl.style.display = 'block';
      const targetText = '> Colocá tu cara haciendo coincidir los óvalos';
      if (encuadreTypingText !== targetText) {
        encuadreTypingText = targetText;
        encuadreTypingChars = 0;
      }
      if (encuadreTypingChars < targetText.length) {
        encuadreTypingChars = Math.min(targetText.length, encuadreTypingChars + dt * 60);
      }
      encuadreTextEl.style.color = 'rgba(230,235,245,0.9)';
      encuadreTextEl.textContent = targetText.slice(0, Math.floor(encuadreTypingChars)) + (encuadreTypingChars < targetText.length ? '▊' : '');
      // Dynamic position hint below main text
      let hint = '';
      if (!sizeOk) {
        hint = sizeRatio < 0.92 ? '> Acercate a la cámara' : '> Alejate un poco';
      } else if (dist >= alignThreshold) {
        const dx = faceX - centerX;
        const dy = faceY - centerY;
        if (Math.abs(dx) > Math.abs(dy)) {
          hint = dx > 0 ? '> Movete un poco a la derecha' : '> Movete un poco a la izquierda';
        } else {
          hint = dy > 0 ? '> Subí un poco' : '> Bajá un poco';
        }
      } else {
        hint = '> Perfecto, mantenete así';
      }
      encuadreHintEl.textContent = hint;
      encuadreHintEl.style.display = 'block';
      encuadreHintEl.style.top = (parseFloat(encuadreTextEl.style.top) + 32) + 'px';
      // Check if aligned (position + size)
      if (dist < alignThreshold && sizeOk) {
        encuadreAlignedTimer += dt;
        if (encuadreAlignedTimer > 0.8) { // hold for 0.8s to avoid flicker
          encuadrePhase = 'aligned';
          encuadreAlignedTimer = 0;
        }
      } else {
        encuadreAlignedTimer = 0;
      }
    } else if (encuadrePhase === 'aligned') {
      // Show "mira la cámara" aligned with camera position
      const camY2 = vh * 0.48;
      const camX2 = 80; // text aligned with camera, arrow to its left
      camArrowEl.style.display = 'block';
      camArrowEl.style.top = camY2 + 'px';
      camArrowEl.style.left = camX2 + 'px';
      camArrowEl.style.color = 'rgba(30,30,30,0.9)';
      camArrowEl.style.whiteSpace = 'nowrap';
      camArrowEl.style.opacity = String(0.6 + Math.sin(Date.now() / 350) * 0.3);
      // Hide the old centered text
      encuadreTextEl.style.display = 'none';
      // Hide backdrop, show bright overlay instead
      // Hide backdrop, show bright overlay instead
      const backdrop = document.getElementById('encuadre-backdrop');
      if (backdrop) backdrop.style.display = 'none';
      // Screen brightens only outside the oval (same mask as backdrop)
      const vw2 = window.innerWidth;
      const vh2 = window.innerHeight;
      const ox = (centerX) / vw2 * 100;
      const oy = (centerY) / vh2 * 100;
      const rx = encuadreOvalW / vw2 * 50;
      const ry = encuadreOvalH / vh2 * 50;
      brightEl.style.display = 'block';
      brightEl.style.webkitMaskImage = `radial-gradient(ellipse ${rx}% ${ry}% at ${ox}% ${oy}%, transparent 0%, transparent 98%, black 100%)`;
      // Position countdown above oval
      countdownEl.style.top = (centerY - encuadreOvalH / 2 - 350) + 'px';
      // Check misalignment (position OR size)
      if (dist >= alignThreshold || !sizeOk) {
        camArrowEl.style.display = 'none';
        encuadrePhase = 'position';
        encuadreTypingChars = 0;
        brightEl.style.display = 'none';
        brightEl.style.webkitMaskImage = '';
        const backdrop2 = document.getElementById('encuadre-backdrop');
        if (backdrop2) backdrop2.style.display = 'block';
        encuadreTextEl.style.color = 'rgba(230,235,245,0.9)';
        encuadreAlignedTimer = 0;
      } else {
        encuadreAlignedTimer += dt;
        if (encuadreAlignedTimer > 1.5) { // 1.5s of looking = start countdown
          // Replace camera instruction with "¡Sonreí!" in same spot
          camArrowEl.innerHTML = '<span style="font-size:32px">◀</span> <span style="font-size:26px">¡Sonreí!</span>';
          encuadrePhase = 'countdown';
          encuadreCountdownValue = 3;
          encuadreCountdownTimer = 0;
          encuadreAlignedTimer = 0;
        }
      }
    } else if (encuadrePhase === 'countdown') {
      encuadreCountdownTimer += dt;
      if (encuadreCountdownTimer >= 1.0) {
        encuadreCountdownTimer = 0;
        encuadreCountdownValue--;
      }
      // Check misalignment during countdown (position OR size)
      if (dist >= alignThreshold || !sizeOk) {
        camArrowEl.style.display = 'none';
        encuadrePhase = 'position';
        encuadreTypingChars = 0;
        brightEl.style.display = 'none';
        brightEl.style.webkitMaskImage = '';
        const backdrop2 = document.getElementById('encuadre-backdrop');
        if (backdrop2) backdrop2.style.display = 'block';
        countdownEl.style.display = 'none';
        encuadreTextEl.style.color = 'rgba(230,235,245,0.9)';
        encuadreAlignedTimer = 0;
      } else if (encuadreCountdownValue <= 0 && !encuadreCapturing) {
        // Capture!
        encuadreCapturing = true;
        countdownEl.style.display = 'none';
        flashEl.style.display = 'block';
        flashEl.style.opacity = '1';
        // Crop based on oval size (viewport-proportional)
        const cropNorm = encuadreOvalH / vw;
        // Upward shift to match visible oval
        const shiftNorm = (encuadreOvalH / vh) * 0.13;
        wsClient.send({ type: 'capture_photo', crop_center_x: p.x, crop_center_y: p.y - shiftNorm, crop_size: cropNorm });
        // Keep flash on for 1.5s so the camera captures the screen-lit face
        setTimeout(() => {
          flashEl.style.opacity = '0';
          setTimeout(() => { flashEl.style.display = 'none'; }, 500);
        }, 1500);
        // Reset for now
        encuadrePhase = 'position';
        encuadreCapturing = false;
        encuadreTypingChars = 0;
        brightEl.style.display = 'none';
        brightEl.style.webkitMaskImage = '';
        const backdrop2 = document.getElementById('encuadre-backdrop');
        if (backdrop2) backdrop2.style.display = 'block';
        encuadreTextEl.style.color = 'rgba(230,235,245,0.9)';
        encuadreAlignedTimer = 0;
      } else {
        countdownEl.style.display = 'block';
        countdownEl.textContent = String(encuadreCountdownValue);
      }
    }
  }
  if (!encuadreActive) {
    ovalContainer.style.display = 'none';
    captureGuideEl.style.display = 'none';
  }

  // ── Welcome box (follows face, slide-up entrance, wave advances) ──
  if (hasFace && !encuadreActive && appState !== 'lectura') {
    if (!dialogActive) {
      dialogActive = true;
      dialogAllShown = true;
      dialogContent.textContent = WELCOME_TEXT;
      dialogHint.innerHTML = WELCOME_HINT + ' ' + WAVE_SVG;
      dialogEl.style.display = 'block';
      dialogEl.style.transform = 'translateY(20px)';
      dialogEl.style.opacity = '0';
      requestAnimationFrame(() => {
        dialogEl.style.transform = 'translateY(0)';
        dialogEl.style.opacity = '1';
      });
    }
    // Position below the face box (follows bounding box)
    const sD = faceTracker.smoothedSize;
    const shD = faceTracker.smoothedHeight;
    const vwD = window.innerWidth;
    const vhD = window.innerHeight;
    const boxW = sD * vwD * 2;
    const boxH = shD * vhD * 2;
    const mx2 = 1 - p.x;
    const rawBoxX = mx2 * vwD - boxW / 2;
    const rawBoxY = p.y * vhD - boxH / 2;
    let dialogX = Math.max(8, Math.min(vwD - 600, rawBoxX));
    let dialogY = rawBoxY + boxH + 12;
    if (dialogY + 120 > vhD) dialogY = rawBoxY - 120;
    dialogEl.style.left = dialogX + 'px';
    dialogEl.style.top = dialogY + 'px';

    // Hint always visible
    dialogHint.style.display = 'block';
    hintFlashTimer = Math.max(0, hintFlashTimer - dt);
    if (hintFlashTimer > 0) {
      dialogHint.innerHTML = CHECK_SVG + 'Saludo detectado';
      dialogHint.style.color = '#4ade80';
      dialogHint.style.borderTopColor = 'rgba(74,222,128,0.2)';
    } else {
      dialogHint.innerHTML = WELCOME_HINT + ' ' + WAVE_SVG;
      dialogHint.style.color = 'rgb(220,210,120)';
      dialogHint.style.borderTopColor = 'rgba(255,255,255,0.15)';
    }

    // Wave gesture advances
    if (dialogCooldown > 0) {
      dialogCooldown -= dt;
    } else if (dialogWavePending && !encuadrePending) {
      dialogWavePending = false;
      dialogAllShown = false;
      encuadrePending = true;
      dialogHint.innerHTML = CHECK_SVG + 'Saludo detectado';
      dialogHint.style.color = '#4ade80';
      dialogHint.style.borderTopColor = 'rgba(74,222,128,0.2)';
      dialogEl.style.display = 'none';
      encuadrePending = false;
      enterEncuadre();
    }
    // Reset absence timer when face is present
    dialogAbsenceTimer = 4.0;
  } else {
    // Don't reset immediately on face loss — wait a few seconds
    if (dialogActive || dialogAllShown) {
      dialogAbsenceTimer -= dt;
      if (dialogAbsenceTimer > 0) {
        // Keep dialog visible during grace period
        if (dialogEl.style.display === 'none') {
          dialogEl.style.display = 'block';
          dialogEl.style.opacity = '0';
          requestAnimationFrame(() => { dialogEl.style.opacity = '1'; });
        }
        if (dialogAllShown) dialogHint.style.display = 'block';
      } else {
        dialogActive = false;
        dialogAllShown = false;
        dialogWavePending = false;
        encuadrePending = false;
        hintFlashTimer = 0;
        dialogCooldown = 0;
        dialogAutoTimer = 0;
        dialogAutoAdvanceSet = false;
        dialogFadeTimer = 0;
        dialogEl.style.display = 'none';
        dialogEl.style.opacity = '0';
        hintEl.style.display = 'none';
      }
    } else {
      hintEl.style.display = 'none';
    }
  }

  // ── Status overlay ──
  if (appState !== 'lectura' && hasFace) {
    statusEl.textContent = '> Persona a reflejar detectada';
    statusTimer = 60;
  } else if (appState !== 'lectura' && statusTimer > 0) {
    statusTimer--;
  } else if (appState !== 'lectura') {
    statusEl.textContent = '> Esperando alguien para reflejar...';
  }

  // ── Dynamic RGB glitch for box and oval ghosts ──
  boxGlitchTimer -= dt;
  if (boxGlitchTimer <= 0) {
    const offMag = 2 + Math.random() * 3;
    for (let i = 0; i < boxGhosts.length && boxGhosts[i].style.display !== 'none'; i++) {
      const ox = (Math.random() - 0.5) * offMag;
      const oy = (Math.random() - 0.5) * offMag;
      const cur = boxGhosts[i].style.transform || 'translate(0px,0px)';
      const m = cur.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
      const baseX = m ? parseFloat(m[1]) : 0;
      const baseY = m ? parseFloat(m[2]) : 0;
      const nx = baseX + (ox - baseX) * 0.3;
      const ny = baseY + (oy - baseY) * 0.3;
      boxGhosts[i].style.transform = 'translate(' + nx.toFixed(2) + 'px, ' + ny.toFixed(2) + 'px)';
    }
    for (let i = 0; i < ovalGhosts.length && ovalGhosts[i].style.display !== 'none'; i++) {
      const ox = (Math.random() - 0.5) * offMag;
      const oy = (Math.random() - 0.5) * offMag;
      const cur = ovalGhosts[i].style.transform || 'translate(0px,0px)';
      const m = cur.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
      const baseX = m ? parseFloat(m[1]) : 0;
      const baseY = m ? parseFloat(m[2]) : 0;
      const nx = baseX + (ox - baseX) * 0.3;
      const ny = baseY + (oy - baseY) * 0.3;
      ovalGhosts[i].style.transform = 'translate(' + nx.toFixed(2) + 'px, ' + ny.toFixed(2) + 'px)';
    }
    boxGlitchTimer = 0.06 + Math.random() * 0.1;
  }

  // ── Dialog box ghost glitch ──
  if (dialogEl.style.display !== 'none') {
    for (let i = 0; i < dialogGhosts.length; i++) {
      const cur = dialogGhosts[i].style.transform || '';
      if (Math.random() < 0.02) {
        const ox = (Math.random() - 0.5) * 2;
        const oy = (Math.random() - 0.5) * 2;
        dialogGhosts[i].style.transform = 'translate(' + ox.toFixed(2) + 'px, ' + oy.toFixed(2) + 'px)';
        dialogGhosts[i].style.opacity = String(0.15 + Math.random() * 0.15);
      } else if (cur) {
        const m = cur.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
        if (m) {
          const x = parseFloat(m[1]), y = parseFloat(m[2]);
          const nx = x + (0 - x) * 0.08;
          const ny = y + (0 - y) * 0.08;
          if (Math.abs(nx) < 0.1 && Math.abs(ny) < 0.1) {
            dialogGhosts[i].style.transform = 'translate(0px, 0px)';
          } else {
            dialogGhosts[i].style.transform = 'translate(' + nx.toFixed(2) + 'px, ' + ny.toFixed(2) + 'px)';
          }
        }
      }
    }
  }



  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

console.log('El Espejo — REPOSO state running (inside the sphere)');
