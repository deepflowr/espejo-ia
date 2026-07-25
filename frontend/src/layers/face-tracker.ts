/**
 * FaceTracker — receives face detection data from WebSocket
 * (via the orchestrator) and provides smoothed coordinates
 * for the bounding box position and size.
 *
 * Currently a mock placeholder for development.
 * Will be wired to real WebSocket data later.
 */

import * as THREE from 'three';

export class FaceTracker {
  public boxPos: THREE.Vector2 = new THREE.Vector2(0.5, 0.5); // normalized 0-1
  public boxSize: number = 0;   // normalized width
  public boxHeight: number = 0; // normalized height
  public disturbance: number = 0;
  public hasFace: boolean = false;

  private _smoothPos: THREE.Vector2 = new THREE.Vector2(0.5, 0.5);
  private _prevPos: THREE.Vector2 = new THREE.Vector2(0.5, 0.5);
  private _smoothSize: number = 0;
  private _smoothHeight: number = 0;
  private _speed: number = 0;

  update(dt: number) {
    this.disturbance *= Math.max(0, 1 - dt * 2);
    this._smoothPos.lerp(this.boxPos, 1 - Math.exp(-8 * dt));
    this._smoothSize += (this.boxSize - this._smoothSize) * (1 - Math.exp(-10 * dt));
    this._smoothHeight += (this.boxHeight - this._smoothHeight) * (1 - Math.exp(-10 * dt));
    // Decay size toward 0 when no face detected
    if (!this.hasFace) {
      this.boxSize *= Math.max(0, 1 - dt * 2);
      this.boxHeight *= Math.max(0, 1 - dt * 2);
    }
    const dx = this._smoothPos.x - this._prevPos.x;
    const dy = this._smoothPos.y - this._prevPos.y;
    this._speed = Math.sqrt(dx * dx + dy * dy) / Math.max(dt, 0.001);
    this._prevPos.copy(this._smoothPos);
    if (this._speed > 0.005) {
      this.disturbance = Math.min(1, this.disturbance + this._speed * 3);
    }
  }

  get smoothedPos(): THREE.Vector2 { return this._smoothPos; }
  get smoothedSize(): number { return this._smoothSize; }
  get smoothedHeight(): number { return this._smoothHeight; }

  updateFromDetection(pos: THREE.Vector2, size: number, height?: number) {
    this.boxPos.copy(pos);
    this.boxSize = size;
    this.boxHeight = height ?? size;
    this.hasFace = size > 0;
  }

  /** Mock a face appearing (for development without WebSocket) */
  mockPresent() {
    this.hasFace = true;
    this.boxSize = 0.12;

    // Gentle breathing / drift animation
    const t = performance.now() / 1000;
    this.boxPos.x = 0.5 + Math.sin(t * 0.3) * 0.05;
    this.boxPos.y = 0.5 + Math.cos(t * 0.4) * 0.03;
  }

  mockAbsent() {
    this.hasFace = false;
    this.boxSize = 0;
  }

}
