/**
 * Mail service — sends the souvenir email with the generated assets.
 *
 * To be implemented when a mail provider is decided (SMTP vs SendGrid/Resend).
 */

/**
 * Send a souvenir email.
 *
 * @param {string} email - Recipient email address
 * @param {object} assets - { photo, pensamiento_es, prompt_en, prompt_es, portrait }
 * @param {function} onComplete
 * @param {function} onError
 */
function sendSouvenir(email, assets, onComplete, onError) {
  // TODO: Implement email sending
  console.log('sendSouvenir called for', email);
  onError(new Error('Mail service not yet implemented'));
}

module.exports = { sendSouvenir };
