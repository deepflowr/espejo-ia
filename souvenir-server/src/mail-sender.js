/**
 * souvenir-server — armado y envío del mail souvenir.
 *
 * PLACEHOLDER (2026-09-06): sin implementar.
 *
 * Responsabilidad: cuando una sesión tiene email + assets completos, arma el mail
 * a partir de `../templates/souvenir.html` y lo envía por SMTP del propio servidor.
 *
 * El mail incluye:
 *  - foto original y retrato generado (adjuntos inline con Content-ID, o link a hosting)
 *  - descripcion (texto en español que se leyó en LECTURA)
 *  - prompt_en + prompt_es
 *  - link al manifiesto / explicación técnica del proyecto
 *
 * A decidir: proveedor SMTP (o API tipo Resend/SendGrid) y si las imágenes van
 * adjuntas inline o subidas a un hosting temporal.
 */

/**
 * Enviar el mail souvenir de una sesión completa.
 * @param {string} sessionId
 * @param {object} assets - { photo, descripcion, prompt_en, prompt_es, portrait }
 * @param {string} email - destinatario
 * @param {function} onComplete
 * @param {function} onError
 */
function sendSouvenir(sessionId, assets, email, onComplete, onError) {
  // TODO: implementar — leer template, rellenar con assets, enviar por SMTP
  console.log('mail-sender: placeholder sendSouvenir para', email, 'sesión', sessionId);
  if (onError) onError(new Error('mail-sender no implementado'));
}

module.exports = { sendSouvenir };
