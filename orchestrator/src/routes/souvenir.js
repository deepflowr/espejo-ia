/**
 * Souvenir REST endpoint — receives email submissions from the souvenir mini-page.
 *
 * POST /souvenir
 * Body: { email: string, session_id: string }
 */

const express = require('express');
const router = express.Router();
const sessionStore = require('../session');
const mailService = require('../services/mail');

router.post('/', (req, res) => {
  const { email, session_id } = req.body;

  if (!email || !session_id) {
    return res.status(400).json({ error: 'email and session_id are required' });
  }

  const session = sessionStore.get(session_id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found or expired' });
  }

  // Trigger email sending (async — don't block response)
  mailService.sendSouvenir(
    email,
    {
      photo: session.photo,
      pensamiento_es: session.pensamiento_es,
      prompt_en: session.prompt_en,
      prompt_es: session.prompt_es,
      portrait: session.portrait,
    },
    () => {
      console.log(`Souvenir sent to ${email} for session ${session_id}`);
    },
    (err) => {
      console.error(`Failed to send souvenir to ${email}:`, err.message);
    }
  );

  res.json({ success: true, message: 'Souvenir will be sent shortly' });
});

module.exports = router;
