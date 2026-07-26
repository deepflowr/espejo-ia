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
import { DIALOGS } from './data/dialogs';
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

// ─── LECTURA layers ────────────────────────────────────────────
const revealMeshObj = createRevealMesh();
scene.add(revealMeshObj.mesh);

let faceAssembly: Awaited<ReturnType<typeof createFaceAssembly>> | null = null;
let analysisHUD: Awaited<ReturnType<typeof createAnalysisHUD>> | null = null;
const lecturaThinking = createLecturaThinking();
const promptBox = createPromptBox();
let storedPromptES = '';
let promptESReady = false;

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
  destroyDescriptionSprites();

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

  // Show waiting text below photo
  const waitingEl = document.createElement('div');
  waitingEl.id = 'lectura-waiting';
  waitingEl.style.cssText = `
    position: fixed;
    top: calc(38% + min(55vh, 440px) / 2 + 16px);
    left: 50%;
    transform: translateX(-50%);
    width: min(85vw, 650px);
    text-align: center;
    font: 20px Consolas, "Courier New", monospace;
    color: rgba(190, 200, 215, 0.8);
    pointer-events: none;
    z-index: 600;
    padding: 10px 16px;
    background: rgba(0, 0, 0, 0.35);
    border-radius: 4px;
    text-shadow: 0 0 12px rgba(0,0,0,0.95);
    box-sizing: border-box;
  `;
  // Spinner + text structure
  const waitingSpinner = document.createElement('span');
  waitingSpinner.id = 'waiting-spinner';
  waitingSpinner.style.cssText = 'display:inline-block;width:1.2em;text-align:right;margin-right:0.3em;';
  waitingSpinner.textContent = '/';
  const waitingText = document.createElement('span');
  waitingText.id = 'waiting-text';
  waitingText.textContent = 'Esperando descripción del modelo tras el espejo...';
  waitingEl.appendChild(waitingSpinner);
  waitingEl.appendChild(waitingText);
  document.body.appendChild(waitingEl);


  // Show thinking box after ~3.5s
  setTimeout(() => {
    if (appState === 'lectura') {
      lecturaThinking.show();
      lecturaThinking.startSpinner();
      // Change waiting text when description box appears
      waitingText.textContent = 'Describiendo a la persona frente al espejo...';
      // Flush any chunks that arrived before the box was ready
      if (pendingChunks.length > 0) {
        for (const pc of pendingChunks) {
          processStreamChunk(pc.channel, pc.delta, pc.done);
        }
        pendingChunks = [];
      } else {
        lecturaThinking.setStatus('enviando foto al modelo...');
      }
      // In debug mode, simulate description
      if (LECTURA_DEBUG) {
        const demoDesc = `* Género: Femenino
* Edad aproximada: ~30 años
* Etnia: Caucásica
* Forma del rostro: Ovalada
* Ojos: Marrones, forma almendrada, cejas finas y arqueadas
* Nariz: Recta, tamaño mediano, perfil armonioso
* Labios: Labios finos, comisuras ligeramente hacia arriba
* Piel: Tono claro, textura uniforme, sin imperfecciones visibles
* Cabello: Castaño oscuro, lacio, largo hasta los hombros
* Expresión: Neutral, relajada
* Iluminación/Ambiente: Iluminación frontal suave, fondo neutro oscuro
* Ropa/Accessorios: No visible en el encuadre`;

        lecturaThinking.appendLine('enviando foto al modelo');
        lecturaThinking.setStatus('generando descripción...');

        const descWords = demoDesc.split(' ');
        let di = 0;
        const descIv = setInterval(() => {
          if (di < descWords.length) {
            lecturaThinking.showDescription(descWords[di] + (di < descWords.length - 1 ? ' ' : ''));
            descriptionBuffer += descWords[di] + (di < descWords.length - 1 ? ' ' : '');
            di++;
          } else {
            clearInterval(descIv);
            lecturaThinking.stopSpinner();
            lecturaThinking.appendLine('descripción generada');
            lecturaThinking.setStatus('Descripción finalizada correctamente');
            lecturaThinking.descriptionDone(5000, () => {
              // After box closes, create floating description sprites
              createDescriptionSprites(demoDesc);
              // Show next text (same as normal flow)
              if (waitingText) waitingText.textContent = 'Generando prompt para la imagen...';
            });
          }
        }, 50);
      }
    }
  }, 3500);
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
  promptBox.hide();
  destroyDescriptionSprites();
  // Clean up waiting text
  const wt = document.getElementById('lectura-waiting');
  if (wt) wt.remove();
  // Restore REPOSO elements
  if (faceFragments) (faceFragments as any).setVisible(true);
  camCanvas.style.opacity = '';
  camCanvas.style.maskImage = '';
  statusEl.style.display = '';
  if (analysisHUD) analysisHUD.hide();
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
  'background:rgba(0,0,0,0.88);',
  'border:1px solid rgba(255,255,255,0.12);',
  'border-radius:0;',
  'padding:16px 20px;',
  'width: min(85vw, 620px);',
  'box-shadow:0 8px 30px rgba(0,0,0,0.5),0 0 12px rgba(255,255,255,0.06);',
  'opacity:0;',
  'transition:opacity 0.6s ease;',
].join('');
document.body.appendChild(dialogEl);

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
  'display:none;',
  'margin-top:12px;',
  'padding-top:10px;',
  'border-top:1px solid rgba(255,255,255,0.06);',
  'font:13px Consolas,"Courier New",monospace;',
  'font-style:italic;',
  'color:rgba(140,160,190,0.5);',
  'text-shadow:0 0 8px rgba(0,0,0,0.9);',
].join('');
dialogHint.textContent = '👋 saluda con la mano para continuar';
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
brightEl.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,255,255,0.85);pointer-events:none;z-index:997;display:none';
document.body.appendChild(brightEl);

// ─── Flash overlay (full white for capture) ───────────────────
const flashEl = document.createElement('div');
flashEl.id = 'encuadre-flash';
flashEl.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#fff;pointer-events:none;z-index:1002;display:none;opacity:0;transition:opacity 0.3s';
document.body.appendChild(flashEl);

function enterEncuadre() {
  encuadreActive = true;
  dialogActive = false;
  dialogEl.style.display = 'none';
  hintEl.style.display = 'none';
  // Signal orchestrator to advance to CAPTURA
  wsClient.send({ type: 'continue' });
  // Face-sized oval guide
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const ovalH = vh * 0.35;
  const ovalW = ovalH * 0.72;
  encuadreOvalW = ovalW;
  encuadreOvalH = ovalH;
  const targetX = (vw - ovalW) / 2;
  const targetY = (vh - ovalH) / 2 - vh * 0.04;
  // Animate the face box to centered oval guide
  boxEl.style.transition = 'all 1.2s cubic-bezier(0.4, 0, 0.2, 1)';
  boxEl.style.borderRadius = '50%';
  boxEl.style.border = '1px solid rgba(255,255,255,0.35)';
  boxEl.style.boxShadow = '0 0 30px rgba(255,255,255,0.1), inset 0 0 30px rgba(255,255,255,0.03)';
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
let waitingSpinnerTick = 0;
let dialogFadeTimer = 0;
let dialogCooldown = 0;
let dialogIndex = 0;
let hintFlashTimer = 0;
let dialogAutoTimer = 0;
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
    }
    // For GENERACION+ states, stay in LECTURA visuals — don't revert to REPOSO
    if ((data.state === 'GENERACION' || data.state === 'REVELACION' || data.state === 'ESPEJO_ACTIVO') && appState === 'lectura') {
      // Keep photo, thinking box, and text visible
      // Face-assembly wireframes stop being updated naturally in the animation loop
    }
  }
  if (data.type === 'photo_captured') {
    capturedPhotoBase64 = `data:image/png;base64,${data.image_b64}`;
  }
  if (data.type === 'stream_chunk') {
    const ch = data.channel as string;
    const delta = data.text_delta as string;
    const done = data.done as boolean;

    // prompt_es and prompt_en always process immediately (not for thinking box)
    if (ch === 'prompt_es' || ch === 'prompt_en') {
      processStreamChunk(ch, delta, done);
    } else if (!document.getElementById('lectura-thinking')?.style.display || document.getElementById('lectura-thinking')!.style.display === 'none') {
      // If thinking box not yet visible, buffer the chunk
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
      lecturaThinking.appendLine('enviando foto al modelo');
      lecturaThinking.setStatus('generando descripción...');
    }
    if (done && streamPhase === 'thinking') {
      streamPhase = 'descripcion';
    }
    return;
  }

  // descripcion: structured description (streamed, shown in box)
  if (ch === 'descripcion') {
    if (streamPhase === 'descripcion' || streamPhase === 'thinking') {
      if (streamPhase === 'thinking') {
        streamPhase = 'descripcion';
      }
      if (!done && delta) {
        lecturaThinking.showDescription(delta);
        descriptionBuffer += delta;
      }
      if (done) {
        streamPhase = 'done';
        lecturaThinking.stopSpinner();
        lecturaThinking.appendLine('descripción generada');
        lecturaThinking.setStatus('Descripción finalizada correctamente');
        // Store full description for floating sprites
        storedDescription = descriptionBuffer;
        // Keep open 6s so person can read, then close
        lecturaThinking.descriptionDone(6000, () => {
          // After box closes, create floating description sprites
          if (storedDescription) {
            createDescriptionSprites(storedDescription);
          }
          // Show next text
          const wtEl = document.getElementById('waiting-text');
          if (wtEl) wtEl.textContent = 'Generando prompt para la imagen...';
        });
      }
    }
    return;
  }

  // Capture prompt_es content
  if (ch === 'prompt_es') {
    if (delta) storedPromptES += delta;
    if (done) {
      promptESReady = true;
      // Show prompt box with a delay after description sprites appear
      setTimeout(() => {
        if (storedPromptES) {
          promptBox.show(storedPromptES);
        }
        const wt3 = document.getElementById('waiting-text'); if (wt3) wt3.textContent = 'Creando contornos de la cara...';
      }, 3000);
    }
    return;
  }
  // Ignore prompt_en for display (used internally)
  if (ch === 'prompt_en') {
    return;
  }
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
    } catch (err) {
      console.warn('LECTURA update error:', err);
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
    // During LECTURA: draw full frame at very low opacity (no face reveal)
    if (frameImg) {
      camCanvas.style.maskImage = 'none';
      camCanvas.style.opacity = '0.2';
      camCtx.clearRect(0, 0, vw, vh);
      camCtx.globalAlpha = 0.2;
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
      camCtx.globalAlpha = 0.1;
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
        // Send crop as fraction of viewport (0-1), vision service converts to image pixels
        const cropNorm = encuadreOvalH / vw;
        // Send crop with upward shift to match the visible oval
        const shiftNorm = (encuadreOvalH / vh) * 0.13;
        wsClient.send({ type: 'capture_photo', crop_center_x: p.x, crop_center_y: p.y - shiftNorm, crop_size: cropNorm });
        // Fade flash out after 300ms
        setTimeout(() => {
          flashEl.style.opacity = '0';
          setTimeout(() => { flashEl.style.display = 'none'; }, 300);
        }, 300);
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
  } else if (!encuadreActive) {
    ovalContainer.style.display = 'none';
    captureGuideEl.style.display = 'none';
  }

  // ── Dialog (follows face, each box fades out before next fades in) ──
  if (hasFace && !encuadreActive && appState !== 'lectura') {
    if (!dialogActive) {
      dialogActive = true;
      dialogIndex = 0;
      dialogAllShown = false;
      dialogFullText = DIALOGS[0];
      dialogCleanText = dialogFullText.replace(/\|\|/g, '').replace(/\|\d+(?:\.\d+)?\|/g, '');
      dialogAutoAdvanceSet = false;
      dialogFadeTimer = 0;
      // Show first dialog with fade in
      dialogContent.textContent = dialogCleanText;
      dialogEl.style.display = 'block';
      dialogEl.style.opacity = '0';
      requestAnimationFrame(() => { dialogEl.style.opacity = '1'; });
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

    // Hint: only show after all dialogs are done
    if (dialogAllShown) {
      dialogHint.style.display = 'block';
      hintFlashTimer = Math.max(0, hintFlashTimer - dt);
      if (hintFlashTimer > 0) {
        dialogHint.textContent = '✓ saludo detectado';
        dialogHint.style.color = '#4ade80';
        dialogHint.style.borderTopColor = 'rgba(74,222,128,0.2)';
      } else {
        dialogHint.textContent = '👋 saluda con la mano para continuar';
        dialogHint.style.color = 'rgba(140,160,190,0.5)';
        dialogHint.style.borderTopColor = 'rgba(255,255,255,0.06)';
      }
    } else {
      dialogHint.style.display = 'none';
    }

    if (dialogFadeTimer > 0) {
      // Waiting for fade-out to complete, then advance
      dialogFadeTimer -= dt;
      if (dialogFadeTimer <= 0) {
        dialogFadeTimer = 0;
        dialogIndex++;
        dialogFullText = DIALOGS[dialogIndex];
        dialogCleanText = dialogFullText.replace(/\|\|/g, '').replace(/\|\d+(?:\.\d+)?\|/g, '');
        dialogContent.textContent = dialogCleanText;
        dialogEl.style.opacity = '1'; // fade in new box
        dialogAutoAdvanceSet = false;
      }
    } else if (!dialogAllShown) {
      // Show current text
      const cleanDisplay = dialogFullText.replace(/\|\|/g, '').replace(/\|\d+(?:\.\d+)?\|/g, '');
      if (dialogContent.textContent !== cleanDisplay) {
        dialogContent.textContent = cleanDisplay;
      }

      // Auto-advance timer
      if (!dialogAutoAdvanceSet) {
        dialogAutoAdvanceSet = true;
        const textLen = cleanDisplay.length;
        dialogAutoTimer = Math.max(4, Math.min(12, 4 + textLen / 30));
      }
      if (dialogAutoTimer > 0) {
        dialogAutoTimer -= dt;
        if (dialogAutoTimer <= 0) {
          dialogAutoTimer = 0;
          if (dialogIndex >= DIALOGS.length - 1) {
            // Last dialog — keep box visible, switch to hint
            dialogAllShown = true;
            dialogWavePending = false;
          } else {
            // Start fade-out for next dialog
            dialogEl.style.opacity = '0';
            dialogFadeTimer = 0.55;
          }
        }
      }
    }

    // Wave gesture advances from the hint screen
    if (dialogAllShown && dialogCooldown > 0) {
      dialogCooldown -= dt;
    } else if (dialogAllShown && dialogWavePending) {
      dialogWavePending = false;
      hintFlashTimer = 1.5;
      dialogCooldown = 0;
      enterEncuadre();
    }
  } else {
    dialogActive = false;
    dialogAllShown = false;
    dialogWavePending = false;
    hintFlashTimer = 0;
    dialogCooldown = 0;
    dialogAutoTimer = 0;
    dialogAutoAdvanceSet = false;
    dialogFadeTimer = 0;
    dialogEl.style.display = 'none';
    dialogEl.style.opacity = '0';
    hintEl.style.display = 'none';
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

  // ── Spinner animation for waiting text ──
  waitingSpinnerTick += dt;
  if (waitingSpinnerTick > 0.1) {
    waitingSpinnerTick = 0;
    const frames = ['|', '/', '-', '\\'];
    const idx = Math.floor(time * 10) % frames.length;
    const sp = document.getElementById('waiting-spinner');
    if (sp) sp.textContent = frames[idx];
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

console.log('El Espejo — REPOSO state running (inside the sphere)');
