/**
 * State Machine for El Espejo.
 *
 * Manages the full experience flow:
 *   REPOSO → DESPERTAR → CAPTURA → CONGELADO → LECTURA → GENERACION → REVELACION → ESPEJO_ACTIVO → SOUVENIR → CIERRE → REPOSO
 *
 * Reset can happen from any state after DESPERTAR if presence is lost.
 */

const STATES = {
  REPOSO:       'REPOSO',
  DESPERTAR:    'DESPERTAR',
  CAPTURA:      'CAPTURA',
  CONGELADO:    'CONGELADO',
  LECTURA:      'LECTURA',
  GENERACION:   'GENERACION',
  REVELACION:   'REVELACION',
  ESPEJO_ACTIVO:'ESPEJO_ACTIVO',
  SOUVENIR:     'SOUVENIR',
  CIERRE:       'CIERRE',
};

// Valid transitions: map of state → allowed next states
const TRANSITIONS = {
  [STATES.REPOSO]:       [STATES.DESPERTAR],
  [STATES.DESPERTAR]:    [STATES.CAPTURA, STATES.REPOSO],
  [STATES.CAPTURA]:      [STATES.CONGELADO, STATES.REPOSO],
  [STATES.CONGELADO]:    [STATES.LECTURA, STATES.REPOSO],
  [STATES.LECTURA]:      [STATES.GENERACION, STATES.REPOSO],
  [STATES.GENERACION]:   [STATES.REVELACION, STATES.REPOSO],
  [STATES.REVELACION]:   [STATES.ESPEJO_ACTIVO, STATES.REPOSO],
  [STATES.ESPEJO_ACTIVO]: [STATES.SOUVENIR, STATES.REPOSO],
  [STATES.SOUVENIR]:     [STATES.CIERRE, STATES.REPOSO],
  [STATES.CIERRE]:       [STATES.REPOSO],
};

class StateMachine {
  constructor() {
    this._state = STATES.REPOSO;
    this._listeners = [];
  }

  get state() {
    return this._state;
  }

  onChange(fn) {
    this._listeners.push(fn);
  }

  /**
   * Attempt to transition to a new state.
   * Returns true if transition was allowed, false otherwise.
   */
  transition(newState) {
    if (newState === this._state) return true;

    const allowed = TRANSITIONS[this._state];
    if (!allowed || !allowed.includes(newState)) {
      console.warn(`Invalid transition: ${this._state} → ${newState}`);
      return false;
    }

    const prev = this._state;
    this._state = newState;
    console.log(`State: ${prev} → ${newState}`);

    for (const fn of this._listeners) {
      fn(newState, prev);
    }
    return true;
  }

  /**
   * Reset to REPOSO — used when presence is lost mid-flow.
   * Allowed from any state except REPOSO itself.
   */
  reset() {
    if (this._state === STATES.REPOSO) return;
    this.transition(STATES.REPOSO);
  }

  isActive() {
    return this._state !== STATES.REPOSO;
  }
}

module.exports = { StateMachine, STATES };
