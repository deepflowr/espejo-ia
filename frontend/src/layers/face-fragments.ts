/**
 * FaceFragments — dynamic face-part particle system.
 *
 * Many instances of face-part wireframes floating at different depths,
 * cycling through appear/disappear lifecycles — just like the text.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ─── Configuration ───────────────────────────────────────────
const INSTANCES_PER_LAYER = 6;
const TOTAL_INSTANCES = 50; // total wireframe objects in the pool

// Depth layers
const DEPTH_LAYERS = [
  { scale: 0.15, opacity: 0.08 },
  { scale: 0.25, opacity: 0.12 },
  { scale: 0.40, opacity: 0.16 },
  { scale: 0.60, opacity: 0.22 },
];

interface FragmentInstance {
  group: THREE.Group;
  lines: THREE.LineSegments;
  ghost: THREE.LineSegments;
  baseX: number;
  baseY: number;
  zBase: number;
  scale: number;
  targetOpacity: number;
  vx: number;
  vy: number;
  phase: number;
  life: number;
  lifeSpeed: number;
  state: 'rising' | 'falling';
  modelIndex: number;
  glitchTimer: number;
}

// RGB glitch colors
const _RGB = [
  new THREE.Color(1.0, 0.0, 0.0),
  new THREE.Color(0.0, 1.0, 0.0),
  new THREE.Color(0.0, 0.0, 1.0),
];

// Ultra-muted — barely visible against the dark background
const COLORS = [
  new THREE.Color(0.10, 0.10, 0.10),
  new THREE.Color(0.15, 0.15, 0.15),
  new THREE.Color(0.08, 0.08, 0.08),
  new THREE.Color(0.12, 0.12, 0.12),
  new THREE.Color(0.06, 0.06, 0.06),
  new THREE.Color(0.18, 0.18, 0.18),
  new THREE.Color(0.04, 0.04, 0.04),
  new THREE.Color(0.14, 0.14, 0.14),
];



export async function createFaceFragments(scene: THREE.Scene): Promise<{
  update: (time: number) => void;
  clear: () => void;
  setVisible: (v: boolean) => void;
}> {
  const loader = new GLTFLoader();
  const instances: FragmentInstance[] = [];

  // ─── Load all face-part models ───────────────────────────
  const modelNames = [
    'left-eye', 'right-eye', 'nose', 'mouth', 'jaw', 'brow',
    'left-cheek', 'right-cheek',
    'upper-face', 'lower-face', 'left-half', 'right-half',
    'full-head',
  ];

  const gltfs = await Promise.all(
    modelNames.map(name => loader.loadAsync(`/models/face-parts/${name}.glb`))
  );

  // Extract wireframe geometries from each model
  const wireframeGeos: THREE.BufferGeometry[] = [];

  for (let i = 0; i < gltfs.length; i++) {
    let geometry: THREE.BufferGeometry | null = null;
    gltfs[i].scene.traverse(child => {
      if ((child as any).isMesh && !geometry) {
        geometry = (child as THREE.Mesh).geometry.clone();
      }
    });
    if (geometry) {
      wireframeGeos.push(new THREE.WireframeGeometry(geometry));
    }
  }

  console.log(`Loaded ${wireframeGeos.length} face-part wireframes`);

  if (wireframeGeos.length === 0) {
    return { update: () => {}, clear: () => {} };
  }

  // ─── Create instances across the full frustum ────────────
  for (let i = 0; i < TOTAL_INSTANCES; i++) {
    const layer = DEPTH_LAYERS[i % DEPTH_LAYERS.length];
    const modelIdx = Math.floor(Math.random() * wireframeGeos.length);
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];

    const geo = wireframeGeos[modelIdx];
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      depthWrite: false,
      opacity: 0,
    });
    const lines = new THREE.LineSegments(geo, mat);
    lines.renderOrder = 5;

    // Ghost/bloom layer — slightly offset and blurred
    const ghostMat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      depthWrite: false,
      opacity: 0,
    });
    const ghost = new THREE.LineSegments(geo, ghostMat);
    ghost.renderOrder = 4;

    const s = layer.scale * (0.7 + Math.random() * 0.6);
    lines.scale.set(s, s, s);
    ghost.scale.set(s * 1.02, s * 1.02, s * 1.02);

    // Spread across the full frustum — reaches edges
    const zDepth = -0.2 - Math.random() * 9;
    const spread = -zDepth * (0.2 + Math.random() * 0.8);
    const angle = Math.random() * Math.PI * 2;
    const baseX = Math.cos(angle) * spread;
    const baseY = Math.sin(angle) * spread * 0.7;
    const baseZ = zDepth;

    const group = new THREE.Group();
    group.add(lines);
    group.add(ghost);
    group.position.set(baseX, baseY, baseZ);

    // Random starting rotation
    group.rotation.set(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
    );

    scene.add(group);

    instances.push({
      group,
      lines,
      ghost,
      baseX,
      baseY,
      zBase: baseZ,
      scale: s,
      targetOpacity: layer.opacity,
      vx: (Math.random() - 0.5) * 0.00005,
      vy: (Math.random() - 0.5) * 0.00005,
      phase: Math.random() * Math.PI * 2,
      life: Math.random() * 0.3,
      lifeSpeed: 0.001 + Math.random() * 0.002,
      state: 'rising',
      modelIndex: modelIdx,
      glitchTimer: Math.random() * 10,
    });
  }

  // ─── Update ──────────────────────────────────────────────
  let _hidden = false;

  function setVisible(v: boolean) {
    _hidden = !v;
    if (_hidden) {
      for (const inst of instances) {
        (inst.lines.material as THREE.LineBasicMaterial).opacity = 0;
        (inst.ghost.material as THREE.LineBasicMaterial).opacity = 0;
      }
    }
  }

  function update(time: number) {
    if (_hidden) return;
    for (const inst of instances) {
      // Lifecycle: rise → fall → respawn
      if (inst.state === 'rising') {
        inst.life += inst.lifeSpeed;
        if (inst.life >= 1) inst.state = 'falling';
      } else {
        inst.life -= inst.lifeSpeed * 0.5;
        if (inst.life <= 0) {
          inst.life = 0;
          inst.state = 'rising';

          const layer = DEPTH_LAYERS[Math.floor(Math.random() * DEPTH_LAYERS.length)];

          const zDepth = -0.2 - Math.random() * 9;
          const spread = -zDepth * (0.2 + Math.random() * 0.8);
          const angle = Math.random() * Math.PI * 2;
          inst.baseX = Math.cos(angle) * spread;
          inst.baseY = Math.sin(angle) * spread * 0.7;
          inst.zBase = zDepth;
          inst.targetOpacity = layer.opacity;

          const s = layer.scale * (0.7 + Math.random() * 0.6);
          inst.scale = s;
          inst.lines.scale.set(s, s, s);
          inst.ghost.scale.set(s * 1.02, s * 1.02, s * 1.02);

          inst.group.rotation.set(
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
          );

          (inst.lines.material as THREE.LineBasicMaterial).color.set(0.15, 0.15, 0.15);
          (inst.ghost.material as THREE.LineBasicMaterial).color.set(0.15, 0.15, 0.15);
        }
      }

      // ── Main wireframe siempre blanco ──
      const mat = inst.lines.material as THREE.LineBasicMaterial;
      mat.color.set(0.15, 0.15, 0.15);

      // ── Solo el ghost tiene glitch RGB ──
      const ghostMat = inst.ghost.material as THREE.LineBasicMaterial;

      inst.glitchTimer -= 0.005;
      if (inst.glitchTimer <= 0) {
        const c = _RGB[Math.floor(Math.random() * 3)];
        ghostMat.color.copy(c);
        inst.ghost.position.set((Math.random()-0.5)*0.025, (Math.random()-0.5)*0.025, 0);
        inst.glitchTimer = 0.06 + Math.random() * 0.1;
      }
      // Recover ghost to gray
      ghostMat.color.r += (0.15 - ghostMat.color.r) * 0.12;
      ghostMat.color.g += (0.15 - ghostMat.color.g) * 0.12;
      ghostMat.color.b += (0.15 - ghostMat.color.b) * 0.12;

      const op = inst.life * inst.targetOpacity;
      mat.opacity += (op - mat.opacity) * 0.05;
      ghostMat.opacity += (op * 0.35 - ghostMat.opacity) * 0.03;

      const blurOff = Math.sin(time * 0.001 + inst.phase) * 0.003;
      inst.ghost.position.x += (blurOff - inst.ghost.position.x) * 0.05;
      inst.ghost.position.y += (blurOff * 0.5 - inst.ghost.position.y) * 0.05;

      // Drift
      inst.baseX += Math.sin(time * 0.003 + inst.phase) * 0.00004;
      inst.baseY += Math.cos(time * 0.0025 + inst.phase * 1.3) * 0.00004;

      // Keep within reasonable bounds
      if (inst.zBase < -9) inst.zBase = -1;
      if (inst.zBase > -0.2) inst.zBase = -0.3;

      // Z oscillation
      const zOff = Math.sin(time * 0.008 + inst.phase) * 0.08;

      // Gentle rotation drift
      inst.group.rotation.x += Math.sin(time * 0.0005 + inst.phase) * 0.0003;
      inst.group.rotation.y += Math.cos(time * 0.0006 + inst.phase * 1.2) * 0.0003;

      inst.group.position.set(
        inst.baseX,
        inst.baseY,
        inst.zBase + zOff,
      );
    }
  }

  // ─── Clear ───────────────────────────────────────────────
  function clear() {
    for (const inst of instances) {
      scene.remove(inst.group);
      inst.lines.geometry.dispose();
      (inst.lines.material as THREE.Material).dispose();
      (inst.ghost.material as THREE.Material).dispose();
    }
    instances.length = 0;
  }

  return { update, clear, setVisible };
}
