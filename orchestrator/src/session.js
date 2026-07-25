/**
 * Session management for El Espejo.
 *
 * Each visit generates a UUID at capture time.
 * Assets (photo, thoughts, prompts, portrait) are stored in memory
 * and cleaned up when the session ends or times out.
 */

const { v4: uuidv4 } = require('uuid');

const SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

class SessionStore {
  constructor() {
    /** @type {Map<string, object>} */
    this._sessions = new Map();
    this._timeouts = new Map();
  }

  /**
   * Create a new session and return its ID.
   */
  create() {
    const id = uuidv4();
    this._sessions.set(id, {
      id,
      createdAt: Date.now(),
      photo: null,          // base64
      pensamiento_es: '',
      prompt_en: '',
      prompt_es: '',
      portrait: null,       // base64
    });
    this._resetTimeout(id);
    console.log(`Session created: ${id}`);
    return id;
  }

  /**
   * Get session data by ID.
   */
  get(id) {
    return this._sessions.get(id) || null;
  }

  /**
   * Update a field in a session.
   */
  set(id, key, value) {
    const session = this._sessions.get(id);
    if (!session) return false;
    session[key] = value;
    this._resetTimeout(id);
    return true;
  }

  /**
   * Check if a session exists.
   */
  has(id) {
    return this._sessions.has(id);
  }

  /**
   * Delete a session and its timeout.
   */
  delete(id) {
    this._clearTimeout(id);
    this._sessions.delete(id);
  }

  _resetTimeout(id) {
    this._clearTimeout(id);
    const timeout = setTimeout(() => {
      console.log(`Session expired: ${id}`);
      this.delete(id);
    }, SESSION_TIMEOUT_MS);
    this._timeouts.set(id, timeout);
  }

  _clearTimeout(id) {
    const existing = this._timeouts.get(id);
    if (existing) {
      clearTimeout(existing);
      this._timeouts.delete(id);
    }
  }
}

// Singleton
module.exports = new SessionStore();
