import * as THREE from 'three';

/**
 * LecturaReveal — DOM-based white overlay that fades opacity.
 *
 * Full white (opacity 1) → fades to transparent (opacity 0),
 * revealing the photo and 3D scene beneath it.
 */

export interface RevealState {
  active: boolean;
  progress: number;
  duration: number;
}

export function createRevealState(duration = 2.2): RevealState {
  return { active: false, progress: 0, duration };
}

export function createRevealMesh(): {
  mesh: THREE.Object3D;
  state: RevealState;
  updateReveal: (dt: number) => void;
  trigger: () => void;
  setProgress: (p: number) => void;
  setCenter: (x: number, y: number) => void;
  isComplete: () => boolean;
  clear: () => void;
} {
  const state = createRevealState();

  const el = document.createElement('div');
  el.id = 'lectura-reveal';
  el.style.cssText = [
    'position:fixed;top:0;left:0;width:100%;height:100%;',
    'background:#fff;pointer-events:none;z-index:9998;',
    'opacity:0;display:none;transition:none',
  ].join('');
  document.body.appendChild(el);

  const mesh = new THREE.Object3D();

  function trigger() {
    state.active = true;
    state.progress = 0;
    el.style.display = 'block';
    el.style.opacity = '1';
  }

  function updateReveal(dt: number) {
    if (!state.active) {
      el.style.display = 'none';
      return;
    }

    state.progress += dt / state.duration;
    if (state.progress >= 1) {
      state.progress = 1;
      state.active = false;
      el.style.display = 'none';
      return;
    }

    // Ease-out: opacity 1 -> 0
    const eased = 1 - Math.pow(1 - state.progress, 2);
    el.style.opacity = String(1 - eased);
  }

  function setProgress(p: number) {
    state.progress = Math.max(0, Math.min(1, p));
    if (p >= 1) {
      el.style.display = 'none';
    } else {
      el.style.display = 'block';
      const eased = 1 - Math.pow(1 - state.progress, 2);
      el.style.opacity = String(1 - eased);
    }
  }

  function setCenter(_x: number, _y: number) {}

  function isComplete() {
    return !state.active && state.progress >= 1;
  }

  function clear() {
    el.remove();
    state.active = false;
    state.progress = 0;
  }

  // Clean up on page unload
  window.addEventListener('beforeunload', () => el.remove());

  return { mesh, state, updateReveal, trigger, setProgress, setCenter, isComplete, clear };
}
