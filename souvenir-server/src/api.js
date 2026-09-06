/**
 * souvenir-server — API REST de sesiones.
 *
 * PLACEHOLDER (2026-09-06): contrato definido, endpoints sin implementar.
 *
 * Contrato:
 *  POST /sessions/:id/assets   body: { type: 'photo'|'descripcion'|'prompt_en'|'prompt_es'|'portrait', data_b64 }
 *      -> el Orchestrator de la instalación empuja cada asset apenas se genera (push en vivo)
 *      -> requiere auth (token compartido / secreto), ver nota de seguridad
 *  GET  /sessions/:id          -> estado de la sesión (qué assets hay, si tiene email)
 *  POST /sessions/:id/email    body: { email }
 *      -> el celular del visitante registra su mail desde la mini-página
 *
 * Regla de envío: cuando una sesión tiene email + assets completos, disparar mail-sender.
 */

const express = require('express');
const router = express.Router();
const db = require('./db');

// TODO: auth del push (secreto compartido) — solo el Orchestrator puede subir assets.
// TODO: POST /:id/assets   -> db.saveAsset(id, type, data)
// TODO: GET  /:id          -> db.getSession(id)
// TODO: POST /:id/email    -> db.setEmail(id, email) y evaluar disparo de envío

router.get('/placeholder', (req, res) => res.json({ ok: true, note: 'api sin implementar' }));

module.exports = router;
