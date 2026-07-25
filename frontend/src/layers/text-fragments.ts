/**
 * TextFragments — words floating in 3D space like a drifting cloud.
 *
 * Each word exists at a depth band with gentle oscillation, creating
 * a persistent cloud of text at varying distances. Opacity falls off
 * softly with depth so words remain visible longer. Scale varies
 * dramatically: tiny specks in the deep, large and bold up close.
 *
 * No flashing, no conveyor belt — a stable atmospheric layer.
 */

import * as THREE from 'three';

const MAX_FRAGMENTS = 180;

// Three clearly distinct depth bands — far, mid, near
const DEPTH_LAYERS = [
  { z: -6,  label: 'far',  scale: 0.15, opacityPeak: 0.35, blur: 4, weight: 0.25 },
  { z: -2,  label: 'far-mid', scale: 0.28, opacityPeak: 0.50, blur: 3, weight: 0.15 },
  { z: 1,   label: 'mid',  scale: 0.50, opacityPeak: 0.70, blur: 2, weight: 0.20 },
  { z: 3.5, label: 'mid-near', scale: 0.85, opacityPeak: 0.85, blur: 1, weight: 0.20 },
  { z: 6,   label: 'near', scale: 1.40, opacityPeak: 0.95, blur: 0, weight: 0.20 },
];

interface FragmentState {
  mesh: THREE.Sprite;
  layerIndex: number;  // index into DEPTH_LAYERS
  zBase: number;
  zAmp: number;
  zSpeed: number;
  zPhase: number;
  vx: number;
  vy: number;
  baseX: number;
  baseY: number;
  text: string;
  blurLevel: number;
}

const BLUR_LEVELS = 6;
const textureCache = new Map<string, THREE.CanvasTexture>();

function getTextTexture(text: string, blurLevel: number): THREE.CanvasTexture {
  const key = `${text}_${blurLevel}`;
  let tex = textureCache.get(key);
  if (tex) return tex;

  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  c.width = 1024;
  c.height = 256;

  ctx.clearRect(0, 0, c.width, c.height);

  const fontSize = 64;
  ctx.font = fontSize + 'px Consolas, "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // White text with slight glow for contrast against dark background
  ctx.shadowColor = `hsla(${Math.random() > 0.5 ? 180 : 300}, 80%, 50%, 0.4)`;
  ctx.shadowBlur = 8;
  ctx.fillStyle = 'rgba(220, 220, 240, 0.95)';

  const blurPx = blurLevel * 3;
  ctx.filter = `blur(${blurPx}px)`;
  ctx.fillText(text, c.width / 2, c.height / 2);

  tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  textureCache.set(key, tex);
  return tex;
}

const words = [
  'piel', 'simetría', 'textura', 'latente', 'semilla',
  'mirada', 'espejo', 'reflejo', 'doble', 'siniestro',
  'desconocimiento', 'simulacro', 'hiperreal', 'situado',
  'otro', 'sí mismo', 'imagen', 'copia', 'original',
  'fantasma', 'máscara', 'presencia', 'ausencia', 'error',
  'falla', 'quiebre', 'quién', 'casi', 'aún', 'eco',
  'rastro', 'residuo', 'memoria', 'olvidar', 'recordar',
  'soy', 'seré', 'fui', 'deviniendo', 'esperando',
  'mask', 'noise', 'seed', 'latent', 'tensor', 'token',
  'umbral', 'todavía no', 'otra vez', 'antes', 'después',
  'belleza', 'estándar', 'promedio', 'ideal', 'canon',
  'sesgo', 'desvío', 'muestra', 'distribución',
  'vigilar', 'escanear', 'capturar', 'observar', 'sensor',
  'lente', 'marco', 'exposición', 'enfoque', 'desenfoque',
  'superficie', 'profundidad', 'signo', 'referente',
  'mímica', 'imitación', 'eco', 'fantasma', 'cicatriz',
];

export function createTextFragments(scene: THREE.Scene) {
  const fragments: FragmentState[] = [];

  function spawn() {
    if (fragments.length >= MAX_FRAGMENTS) return;

    const text = words[Math.floor(Math.random() * words.length)];
    // Pick a random depth layer by weight
    const totalWeight = DEPTH_LAYERS.reduce((s, l) => s + l.weight, 0);
    const r = Math.random() * totalWeight;
    let cum = 0;
    let layerIndex = 0;
    for (let i = 0; i < DEPTH_LAYERS.length; i++) {
      cum += DEPTH_LAYERS[i].weight;
      if (r <= cum) { layerIndex = i; break; }
    }

    const layer = DEPTH_LAYERS[layerIndex];
    const tex = getTextTexture(text, layer.blur);

    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: false,
      depthWrite: false,
      depthTest: false,
      opacity: 1,
    });
    const mesh = new THREE.Sprite(mat);

    const zAmp = 0.3 + Math.random() * 0.6;  // smaller oscillation to stay in band
    const zSpeed = 0.06 + Math.random() * 0.12;
    const zPhase = Math.random() * Math.PI * 2;

    // All words within safe view range
    const x = (Math.random() - 0.5) * 1.6;
    const y = (Math.random() - 0.5) * 1.6;
    mesh.position.set(x, y, layer.z);

    // Ensure sprites render on top of the shader plane
    mesh.renderOrder = 10;

    fragments.push({
      mesh,
      layerIndex,
      zBase: layer.z,
      zAmp,
      zSpeed,
      zPhase,
      vx: (Math.random() - 0.5) * 0.0008,
      vy: (Math.random() - 0.5) * 0.0008,
      baseX: x,
      baseY: y,
      text,
      blurLevel: layer.blur,
    });
  }

  function update(time: number, boxPos: THREE.Vector2, boxSize: number) {
    if (fragments.length < MAX_FRAGMENTS && Math.random() < 0.08) spawn();

    for (let i = fragments.length - 1; i >= 0; i--) {
      const f = fragments[i];

      // Keep layer assignment, just oscillate gently around it
      const zOffset = Math.sin(time * f.zSpeed + f.zPhase) * f.zAmp;
      const currentZ = f.zBase + zOffset;

      // Use the layer's preset values directly
      const layer = DEPTH_LAYERS[f.layerIndex];
      const scale = layer.scale;

      // Full opacity — no fading
      f.mesh.material.opacity = 1;
      f.mesh.scale.set(scale, scale * 0.25, 1);

      // Lateral drift
      f.baseX += f.vx;
      f.baseY += f.vy;

      if (f.baseX > 1.8) f.baseX = -1.8;
      if (f.baseX < -1.8) f.baseX = 1.8;
      if (f.baseY > 1.5) f.baseY = -1.5;
      if (f.baseY < -1.5) f.baseY = 1.5;

      // Repulsion from box
      const dx = f.baseX - boxPos.x;
      const dy = f.baseY - boxPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const boxHalf = boxSize * 0.4;
      if (dist < boxHalf + 0.3 && dist > 0.001 && boxSize > 0) {
        const force = (boxHalf + 0.3 - dist) / (boxHalf + 0.3) * 0.02;
        f.baseX += (dx / dist) * force;
        f.baseY += (dy / dist) * force;
      }

      f.mesh.position.x = f.baseX;
      f.mesh.position.y = f.baseY;
      f.mesh.position.z = currentZ;
    }
  }

  function clear() {
    for (const f of fragments) {
      scene.remove(f.mesh);
      f.mesh.material.dispose();
      if (f.mesh.material.map) f.mesh.material.map.dispose();
    }
    fragments.length = 0;
    textureCache.clear();
  }

  // Spawn a full spread — lots of words in every layer
  for (let i = 0; i < 150; i++) spawn();

  return { update, clear };
}
