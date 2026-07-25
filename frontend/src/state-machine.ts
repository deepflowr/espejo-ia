/**
 * State machine for the frontend — mirrors the orchestrator's states.
 *
 * For now, only REPOSO is active. Other states are placeholders
 * to be wired when their corresponding visuals are built.
 */

export type FlowState =
  | 'REPOSO'
  | 'DESPERTAR'
  | 'CAPTURA'
  | 'CONGELADO'
  | 'LECTURA'
  | 'GENERACION'
  | 'REVELACION'
  | 'ESPEJO_ACTIVO'
  | 'SOUVENIR';

export type StateChangeCallback = (state: FlowState) => void;

export class FrontendStateMachine {
  private _state: FlowState = 'REPOSO';
  private _listeners: StateChangeCallback[] = [];

  get state(): FlowState {
    return this._state;
  }

  setState(newState: FlowState) {
    if (newState === this._state) return;
    console.log(`State: ${this._state} → ${newState}`);
    this._state = newState;
    for (const cb of this._listeners) cb(newState);
  }

  onChange(cb: StateChangeCallback) {
    this._listeners.push(cb);
  }
}
