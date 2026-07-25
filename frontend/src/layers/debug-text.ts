/**
 * Debug text test — paints a single large word on the canvas
 * to verify the text rendering pipeline works.
 */

import * as THREE from 'three';

export function createDebugText(scene: THREE.Scene): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = 1024;
  canvas.height = 256;

  ctx.clearRect(0, 0, 1024, 256);

  // Bright green, huge, fully opaque
  ctx.font = 'bold 120px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#00ff00';
  ctx.fillText('TEXTO', 512, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: false,
    depthWrite: false,
    depthTest: false,
    opacity: 1.0,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(0, 0, 100); // far in front
  sprite.scale.set(1.5, 0.4, 1);
  sprite.renderOrder = 100; // render on top of everything

  scene.add(sprite);
  return sprite;
}
