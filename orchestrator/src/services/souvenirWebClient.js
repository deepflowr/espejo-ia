/**
 * souvenirWebClient — cliente del Orchestrator hacia el servidor remoto de souvenirs.
 *
 * PLACEHOLDER (2026-09-06): contrato definido, sin implementar.
 *
 * Rol: empujar (push) cada asset de la sesión al servidor remoto (`souvenir-server/`)
 * apenas se genera, durante la visita. El Orchestrator está detrás de NAT, así que
 * solo puede SALIR por HTTPS hacia el servidor remoto (que sí es alcanzable).
 *
 * Uso esperado (desde index.js / stateMachine.js):
 *  - al capturar la foto        -> pushAsset(sessionId, 'photo', imageB64)
 *  - en LECTURA (streaming)     -> pushAsset(sessionId, 'descripcion' | 'prompt_en' | 'prompt_es', text)
 *  - en REVELACION (retrato)    -> pushAsset(sessionId, 'portrait', portraitB64)
 *
 * Contrato con el servidor remoto:
 *  POST https://<dominio>/api/sessions/<id>/assets
 *      body: { type: 'photo'|'descripcion'|'prompt_en'|'prompt_es'|'portrait', data_b64 }
 *      auth: token/secreto compartido (a definir) — ver docs §8 / §11
 *
 * Config necesaria: SOUVENIR_BASE_URL (dominio remoto) y el secreto de auth.
 */

const SOUVENIR_BASE_URL = process.env.SOUVENIR_BASE_URL || ''; // ej. 'https://souvenir.midominio.com'

/**
 * Empuja un asset de la sesión al servidor remoto.
 * @param {string} sessionId - UUID de la visita
 * @param {'photo'|'descripcion'|'prompt_en'|'prompt_es'|'portrait'} type
 * @param {string} dataB64 - contenido del asset (base64 o texto)
 */
function pushAsset(sessionId, type, dataB64) {
  // TODO: implementar — POST a `${SOUVENIR_BASE_URL}/api/sessions/${sessionId}/assets`
  // con auth. No bloquear el flujo: loguear errores pero no frenar la experiencia.
  console.log(`souvenirWebClient: placeholder push ${type} de sesión ${sessionId}`);
}

module.exports = { pushAsset };
