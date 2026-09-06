/**
 * FaceAssembly — face-part wireframes trying to assemble into a face.
 *
 * Same .glb models as face-fragments, but with a different behavior:
 * parts are scattered, then converge toward a "face template" position.
 * When assembled, they hold briefly, then scatter and try a different
 * configuration — as if the model is searching for the right face.
 *
 * Same visual style: white wireframes + RGB glitch on ghost.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ─── Configuration ───────────────────────────────────────────
const TOTAL_INSTANCES = 30;

// Gray colors (same muted palette as face-fragments)
const COLORS = [
  new THREE.Color(0.10, 0.10, 0.10),
  new THREE.Color(0.15, 0.15, 0.15),
  new THREE.Color(0.08, 0.08, 0.08),
  new THREE.Color(0.12, 0.12, 0.12),
  new THREE.Color(0.18, 0.18, 0.18),
  new THREE.Color(0.06, 0.06, 0.06),
];

// RGB glitch colors
const _RGB = [
  new THREE.Color(1.0, 0.0, 0.0),
  new THREE.Color(0.0, 1.0, 0.0),
  new THREE.Color(0.0, 0.0, 1.0),
];

// Depth layers (same as face-fragments)
const DEPTH_LAYERS = [
  { scale: 0.15, opacity: 0.08, zRange: [-8, -4] },
  { scale: 0.25, opacity: 0.12, zRange: [-4, -2] },
  { scale: 0.40, opacity: 0.16, zRange: [-2, -0.8] },
  { scale: 0.60, opacity: 0.22, zRange: [-0.8, -0.2] },
];

// ─── Face template: canonical positions for each part ────────
// Normalized coordinates: (0,0) = face center
interface PartTarget {
  modelName: string;
  tx: number; // target X (normalized)
  ty: number; // target Y (normalized)
  tz: number; // target Z depth offset
  scale: number;
  rotX: number;
  rotY: number;
  rotZ: number;
}

const FACE_TEMPLATES: PartTarget[][] = [
  // Template 0: standard frontal face
  [
    { modelName: 'left-eye',   tx: -0.12, ty:  0.10, tz: 0, scale: 0.8,  rotX: 0, rotY: 0, rotZ: 0 },
    { modelName: 'right-eye',  tx:  0.12, ty:  0.10, tz: 0, scale: 0.8,  rotX: 0, rotY: 0, rotZ: 0 },
    { modelName: 'nose',       tx:  0.00, ty: -0.02, tz: 0.05, scale: 0.9,  rotX: 0, rotY: 0, rotZ: 0 },
    { modelName: 'mouth',      tx:  0.00, ty: -0.15, tz: 0, scale: 0.8,  rotX: 0, rotY: 0, rotZ: 0 },
    { modelName: 'jaw',        tx:  0.00, ty: -0.28, tz: -0.03, scale: 1.0, rotX: 0, rotY: 0, rotZ: 0 },
    { modelName: 'brow',       tx:  0.00, ty:  0.18, tz: 0.02, scale: 0.7,  rotX: 0, rotY: 0, rotZ: 0 },
    { modelName: 'left-cheek', tx: -0.18, ty:  0.02, tz: -0.02, scale: 0.7,  rotX: 0, rotY: 0, rotZ: 0 },
    { modelName: 'right-cheek',tx:  0.18, ty:  0.02, tz: -0.02, scale: 0.7,  rotX: 0, rotY: 0, rotZ: 0 },
    { modelName: 'upper-face', tx:  0.00, ty:  0.12, tz: 0.01, scale: 0.9,  rotX: 0, rotY: 0, rotZ: 0 },
    { modelName: 'lower-face', tx:  0.00, ty: -0.15, tz: 0, scale: 0.9,  rotX: 0, rotY: 0, rotZ: 0 },
    { modelName: 'left-half',  tx: -0.08, ty:  0.00, tz: 0, scale: 0.8,  rotX: 0, rotY: 0.1, rotZ: 0 },
    { modelName: 'right-half', tx:  0.08, ty:  0.00, tz: 0, scale: 0.8,  rotX: 0, rotY: -0.1, rotZ: 0 },
    { modelName: 'full-head',  tx:  0.00, ty:  0.00, tz: -0.05, scale: 1.1, rotX: 0, rotY: 0, rotZ: 0 },
  ],
  // Template 1: wider face
  [
    { modelName: 'left-eye',   tx: -0.14, ty:  0.09, tz: 0, scale: 0.75, rotX: 0, rotY: 0.05, rotZ: 0 },
    { modelName: 'right-eye',  tx:  0.14, ty:  0.09, tz: 0, scale: 0.75, rotX: 0, rotY: -0.05, rotZ: 0 },
    { modelName: 'nose',       tx:  0.00, ty: -0.03, tz: 0.06, scale: 0.85, rotX: 0.05, rotY: 0, rotZ: 0 },
    { modelName: 'mouth',      tx:  0.00, ty: -0.17, tz: 0.01, scale: 0.85, rotX: 0, rotY: 0, rotZ: 0 },
    { modelName: 'jaw',        tx:  0.00, ty: -0.30, tz: -0.02, scale: 1.05, rotX: 0, rotY: 0, rotZ: 0 },
    { modelName: 'brow',       tx:  0.00, ty:  0.17, tz: 0.03, scale: 0.65, rotX: 0, rotY: 0, rotZ: 0.03 },
    { modelName: 'left-cheek', tx: -0.22, ty:  0.01, tz: -0.03, scale: 0.65, rotX: 0, rotY: 0, rotZ: 0 },
    { modelName: 'right-cheek',tx:  0.22, ty:  0.01, tz: -0.03, scale: 0.65, rotX: 0, rotY: 0, rotZ: 0 },
    { modelName: 'upper-face', tx:  0.00, ty:  0.13, tz: 0, scale: 0.85, rotX: 0, rotY: 0, rotZ: 0 },
    { modelName: 'lower-face', tx:  0.00, ty: -0.16, tz: 0.01, scale: 0.85, rotX: 0, rotY: 0, rotZ: 0 },
    { modelName: 'left-half',  tx: -0.10, ty:  0.00, tz: -0.01, scale: 0.75, rotX: 0, rotY: 0.15, rotZ: 0 },
    { modelName: 'right-half', tx:  0.10, ty:  0.00, tz: -0.01, scale: 0.75, rotX: 0, rotY: -0.15, rotZ: 0 },
    { modelName: 'full-head',  tx:  0.00, ty:  0.00, tz: -0.06, scale: 1.15, rotX: 0.02, rotY: 0, rotZ: 0 },
  ],
  // Template 2: narrow/long face
  [
    { modelName: 'left-eye',   tx: -0.10, ty:  0.12, tz: 0, scale: 0.85, rotX: 0, rotY: 0, rotZ: -0.02 },
    { modelName: 'right-eye',  tx:  0.10, ty:  0.12, tz: 0, scale: 0.85, rotX: 0, rotY: 0, rotZ: 0.02 },
    { modelName: 'nose',       tx:  0.00, ty:  0.00, tz: 0.04, scale: 0.95, rotX: 0, rotY: 0, rotZ: 0 },
    { modelName: 'mouth',      tx:  0.00, ty: -0.18, tz: -0.01, scale: 0.75, rotX: 0, rotY: 0, rotZ: 0 },
    { modelName: 'jaw',        tx:  0.00, ty: -0.32, tz: -0.04, scale: 0.95, rotX: 0, rotY: 0, rotZ: 0 },
    { modelName: 'brow',       tx:  0.00, ty:  0.20, tz: 0.01, scale: 0.75, rotX: 0, rotY: 0, rotZ: 0 },
    { modelName: 'left-cheek', tx: -0.16, ty:  0.03, tz: -0.01, scale: 0.75, rotX: 0, rotY: 0, rotZ: 0 },
    { modelName: 'right-cheek',tx:  0.16, ty:  0.03, tz: -0.01, scale: 0.75, rotX: 0, rotY: 0, rotZ: 0 },
    { modelName: 'upper-face', tx:  0.00, ty:  0.14, tz: 0.01, scale: 0.8,  rotX: 0, rotY: 0, rotZ: 0 },
    { modelName: 'lower-face', tx:  0.00, ty: -0.18, tz: -0.01, scale: 0.8,  rotX: 0, rotY: 0, rotZ: 0 },
    { modelName: 'left-half',  tx: -0.07, ty:  0.00, tz: 0, scale: 0.85, rotX: 0, rotY: 0.05, rotZ: 0 },
    { modelName: 'right-half', tx:  0.07, ty:  0.00, tz: 0, scale: 0.85, rotX: 0, rotY: -0.05, rotZ: 0 },
    { modelName: 'full-head',  tx:  0.00, ty:  0.00, tz: -0.04, scale: 1.05, rotX: 0, rotY: 0, rotZ: 0 },
  ],
];


interface AssemblyInstance {
  group: THREE.Group;
  lines: THREE.LineSegments;
  ghost: THREE.LineSegments;
  modelName: string;
  modelIndex: number;
  // Current world position (scatter target)
  scatterPos: THREE.Vector3;
  // Target face position (normalized, relative to face center)
  targetOffset: THREE.Vector3;
  faceCenter: THREE.Vector3;
  // Animation state
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rotVel: THREE.Vector3;
  targetRot: THREE.Euler;
  currentRot: THREE.Euler;
  targetScale: number;
  currentScale: number;
  // Glitch
  glitchTimer: number;
  // Phase offset for wobble
  phase: number;
}

export async function createFaceAssembly(scene: THREE.Scene) {
  const loader = new GLTFLoader();

  // Same model names as face-fragments
  const modelNames = [
    'left-eye', 'right-eye', 'nose', 'mouth', 'jaw', 'brow',
    'left-cheek', 'right-cheek',
    'upper-face', 'lower-face', 'left-half', 'right-half',
    'full-head',
  ];

  const gltfs = await Promise.all(
    modelNames.map(name => loader.loadAsync(`/models/face-parts/${name}.glb`))
  );

  // Extract wireframe geometries
  const wireframeGeos: THREE.BufferGeometry[] = [];
  const nameToGeo = new Map<string, THREE.BufferGeometry>();

  for (let i = 0; i < gltfs.length; i++) {
    let geometry: THREE.BufferGeometry | null = null;
    gltfs[i].scene.traverse(child => {
      if ((child as any).isMesh && !geometry) {
        geometry = (child as THREE.Mesh).geometry.clone();
      }
    });
    if (geometry) {
      const wg = new THREE.WireframeGeometry(geometry);
      wireframeGeos.push(wg);
      nameToGeo.set(modelNames[i], wg);
    }
  }

  console.log(`FaceAssembly: loaded ${wireframeGeos.length} wireframes`);

  if (wireframeGeos.length === 0) {
    return { update: () => {}, clear: () => {}, triggerAssemble: () => {} };
  }

  const instances: AssemblyInstance[] = [];
  const faceGroups: THREE.Group[] = []; // groups of parts forming a face

  // Create instances for each model
  for (let i = 0; i < TOTAL_INSTANCES; i++) {
    const modelIdx = i % wireframeGeos.length;
    const geo = wireframeGeos[modelIdx];
    const modelName = modelNames[modelIdx];

    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      depthWrite: false,
      opacity: 0, // starts hidden, LECTURA update fades in
    });
    const lines = new THREE.LineSegments(geo, mat);
    lines.renderOrder = 5;

    const ghostMat = new THREE.LineBasicMaterial({
      color: color.clone(),
      transparent: true,
      depthWrite: false,
      opacity: 0, // starts hidden
    });
    const ghost = new THREE.LineSegments(geo, ghostMat);
    ghost.renderOrder = 4;

    // Pick a depth layer for this instance
    const layer = DEPTH_LAYERS[i % DEPTH_LAYERS.length];

    // Start scattered — wide frustum, varies by depth layer
    const zMin = layer.zRange[0];
    const zMax = layer.zRange[1];
    const zDepth = zMin + Math.random() * (zMax - zMin);
    const spread = -zDepth * (0.3 + Math.random() * 1.0);
    const angle = Math.random() * Math.PI * 2;
    const startPos = new THREE.Vector3(
      Math.cos(angle) * spread,
      Math.sin(angle) * spread * 0.7,
      zDepth,
    );

    const group = new THREE.Group();
    group.add(lines);
    group.add(ghost);
    group.position.copy(startPos);

    const s = layer.scale * (0.7 + Math.random() * 0.6);
    lines.scale.set(s, s, s);
    ghost.scale.set(s * 1.02, s * 1.02, s * 1.02);

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
      modelName,
      modelIndex: modelIdx,
      scatterPos: startPos.clone(),
      targetOffset: new THREE.Vector3(0, 0, 0),
      faceCenter: new THREE.Vector3(0, 0, -2),
      pos: startPos.clone(),
      vel: new THREE.Vector3(),
      rotVel: new THREE.Vector3(),
      targetRot: new THREE.Euler(),
      currentRot: new THREE.Euler().copy(group.rotation),
      targetScale: s,
      currentScale: s,
      glitchTimer: Math.random() * 10,
      phase: Math.random() * Math.PI * 2,
    });
  }

  // ─── Converging pairs ──────────────────────────────────
  // Instances are grouped into pairs. Each pair:
  // - Same depth layer and scale
  // - Comes from opposite sides toward a center point
  // - Almost touches, then fades and resets
  // - Different pairs at different depths

  const PAIR_COUNT = Math.floor(TOTAL_INSTANCES / 2);
  interface PairState {
    center: THREE.Vector3;
    spawnDir: THREE.Vector3; // normalized direction from center
    spawnDist: number;       // distance from center to spawn
    progress: number;        // 0→1
    speed: number;
    phase: number;
  }

  const pairs: PairState[] = [];

  for (let p = 0; p < PAIR_COUNT; p++) {
    const layerIdx = p % DEPTH_LAYERS.length;
    const layer = DEPTH_LAYERS[layerIdx];
    const cz = layer.zRange[0] + Math.random() * (layer.zRange[1] - layer.zRange[0]);
    const angle = Math.random() * Math.PI * 2;
    const spawnDist = 1.0 + Math.random() * 1.5;

    pairs.push({
      center: new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.5, cz),
      spawnDir: new THREE.Vector3(Math.cos(angle), Math.sin(angle) * 0.7, 0).normalize(),
      spawnDist,
      progress: Math.random(),
      speed: 0.00015 + Math.random() * 0.0002, // very slow: 30-65s per cycle
      phase: Math.random() * Math.PI * 2,
    });
  }

  // Assign instances to pairs (2 per pair: one on each side)
  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i];
    const pairIdx = Math.floor(i / 2);
    const side = i % 2 === 0 ? 1 : -1; // opposite sides
    const pair = pairs[pairIdx];
    const layer = DEPTH_LAYERS[pairIdx % DEPTH_LAYERS.length];
    (inst as any)._pair = pair;
    (inst as any)._side = side;
    (inst as any)._layer = layer;
    (inst as any)._phase = Math.random() * Math.PI * 2;

    // Store the precomputed scale for this pair
    (inst as any)._pairScale = layer.scale * (0.7 + Math.random() * 0.6);
  }

  let attemptCount = 0;

  // ─── Update ──────────────────────────────────────────────
  function update(time: number) {
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
      const pair = (inst as any)._pair as PairState;
      const side = (inst as any)._side as number;
      const layer = (inst as any)._layer;
      const phase = (inst as any)._phase;
      const pairScale = (inst as any)._pairScale as number;

      // Advance progress
      pair.progress += pair.speed;
      if (pair.progress >= 1) {
        pair.progress = 0;
        // Respawn with new parameters
        const newLayerIdx = Math.floor(Math.random() * DEPTH_LAYERS.length);
        const newLayer = DEPTH_LAYERS[newLayerIdx];
        const newCz = newLayer.zRange[0] + Math.random() * (newLayer.zRange[1] - newLayer.zRange[0]);
        const newAngle = Math.random() * Math.PI * 2;
        pair.center.set(
          (Math.random() - 0.5) * 0.6,
          (Math.random() - 0.5) * 0.5,
          newCz,
        );
        pair.spawnDir.set(Math.cos(newAngle), Math.sin(newAngle) * 0.7, 0).normalize();
        pair.spawnDist = 1.0 + Math.random() * 1.5;
        pair.speed = 0.00015 + Math.random() * 0.0002;
        (inst as any)._pairScale = newLayer.scale * (0.7 + Math.random() * 0.6);
        (inst as any)._layer = newLayer;
        attemptCount++;
      }

      // Compute position: from spawn toward center
      // Easing: slow in, slow out
      const p = pair.progress;
      const eased = p < 0.5
        ? 2 * p * p
        : 1 - Math.pow(-2 * p + 2, 2) / 2;

      // Start from spawn (opposite sides), move toward center
      const spawnOffset = pair.spawnDir.clone().multiplyScalar(pair.spawnDist * side);
      const startPos = pair.center.clone().add(spawnOffset);

      // Interpolate
      inst.group.position.lerpVectors(startPos, pair.center, eased);

      // Scale: use pair's scale
      inst.currentScale = pairScale;
      inst.lines.scale.set(inst.currentScale, inst.currentScale, inst.currentScale);
      inst.ghost.scale.set(inst.currentScale * 1.02, inst.currentScale * 1.02, inst.currentScale * 1.02);

      // Gentle rotation
      inst.group.rotation.x += Math.sin(time * 0.0004 + phase) * 0.0003;
      inst.group.rotation.y += Math.cos(time * 0.0006 + phase * 1.2) * 0.0003;

      // Opacity: bright in the middle, fade out at both ends
      // Peaks when they're close (progress 0.6-0.8), fades before touching (progress 0.85+)
      const fadeIn = Math.min(1, p * 4); // fade in during first 25%
      const fadeOut = Math.max(0, 1 - Math.max(0, p - 0.7) / 0.25); // fade out from 70% to 95%
      const targetOpacity = fadeIn * fadeOut * layer.opacity * 2.0;

      const mat = inst.lines.material as THREE.LineBasicMaterial;
      mat.opacity += (targetOpacity - mat.opacity) * 0.05;
      mat.color.set(0.15, 0.15, 0.15);

      // Ghost RGB glitch
      const ghostMat = inst.ghost.material as THREE.LineBasicMaterial;
      inst.glitchTimer -= 0.005;
      if (inst.glitchTimer <= 0) {
        const c = _RGB[Math.floor(Math.random() * 3)];
        ghostMat.color.copy(c);
        inst.ghost.position.set((Math.random() - 0.5) * 0.025, (Math.random() - 0.5) * 0.025, 0);
        inst.glitchTimer = 0.06 + Math.random() * 0.1;
      }
      ghostMat.color.r += (0.15 - ghostMat.color.r) * 0.12;
      ghostMat.color.g += (0.15 - ghostMat.color.g) * 0.12;
      ghostMat.color.b += (0.15 - ghostMat.color.b) * 0.12;
      ghostMat.opacity += (targetOpacity * 0.35 - ghostMat.opacity) * 0.03;

      // Ghost blur offset
      const blurOff = Math.sin(time * 0.001 + phase) * 0.003;
      inst.ghost.position.x += (blurOff - inst.ghost.position.x) * 0.05;
      inst.ghost.position.y += (blurOff * 0.5 - inst.ghost.position.y) * 0.05;
    }
  }

  function clear() {
    for (const inst of instances) {
      scene.remove(inst.group);
      inst.lines.geometry.dispose();
      (inst.lines.material as THREE.Material).dispose();
      (inst.ghost.material as THREE.Material).dispose();
    }
    instances.length = 0;
  }

  // Vórtice de entrada al espejo: cada instancia se chupa hacia el punto objetivo
  // (la cara), girando, encogiéndose y desvaneciéndose. `ease` va de 0→1.
  function vortex(target: THREE.Vector3, ease: number) {
    for (const inst of instances) {
      const g = inst.group;
      const k = 0.18 + ease * 0.72;
      g.position.x += (target.x - g.position.x) * k;
      g.position.y += (target.y - g.position.y) * k;
      g.position.z += (target.z - g.position.z) * (0.10 + ease * 0.5);
      g.rotation.x += 0.03 + 0.02 * ease;
      g.rotation.z += 0.03 + 0.02 * ease;
      const sc = Math.max(0.001, inst.lines.scale.x * 0.96);
      inst.lines.scale.setScalar(sc);
      inst.ghost.scale.setScalar(sc * 1.02);
      const mat = inst.lines.material as THREE.LineBasicMaterial;
      mat.opacity = Math.min(mat.opacity, (1 - ease) * 0.5);
      (inst.ghost.material as THREE.LineBasicMaterial).opacity = mat.opacity * 0.3;
    }
  }

  return {
    update,
    clear,
    vortex,
    getPhase: () => 'active',
    getAttemptCount: () => attemptCount,
  };
}
