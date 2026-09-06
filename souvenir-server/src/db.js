/**
 * souvenir-server — persistencia de sesiones.
 *
 * PLACEHOLDER (2026-09-06): modelo pensado, sin implementar.
 *
 * Modelo: tabla `sessions` con
 *  id (session_id del Orchestrator, UUID)
 *  photo / descripcion / prompt_en / prompt_es / portrait  (assets; base64 o archivos)
 *  email
 *  estado  (ej. 'collecting' -> 'ready' -> 'sent')
 *  timestamps (created_at, updated_at, sent_at)
 *
 * SQLite alcanza para este volumen. Los assets conviene guardarlos como archivos
 * (carpeta por session_id) y en la DB solo la ruta, para no inflar la tabla con base64.
 */

// TODO: inicializar la base (mejor_sqlite3 o sqlite3)
// TODO: createSession(id)
// TODO: saveAsset(id, type, data)
// TODO: setEmail(id, email)
// TODO: getSession(id)
// TODO: marcar como enviada

module.exports = {
  // placeholders — reemplazar por las funciones reales
  getSession: () => Promise.resolve(null),
  saveAsset: () => Promise.resolve(false),
  setEmail: () => Promise.resolve(false),
};
