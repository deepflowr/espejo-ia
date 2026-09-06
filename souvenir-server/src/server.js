/**
 * souvenir-server — entry point.
 *
 * PLACEHOLDER (2026-09-06): arranca la web (mini-página del form) + la API REST
 * de sesiones del souvenir. Sin implementar todavía.
 *
 * Cuando se implemente:
 *  - servir `../public` (la mini-página a la que apunta el QR)
 *  - montar las rutas de `api.js`
 *  - leer configuración: dominio público, secreto de auth del push, SMTP
 */

const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// TODO: app.use(express.json({ limit: '50mb' }));  // los assets viajan en base64
// TODO: app.use(express.static(path.join(__dirname, '..', 'public')));
// TODO: app.use('/api/sessions', require('./api'));

app.get('/health', (req, res) => res.json({ ok: true, service: 'souvenir-server', status: 'placeholder' }));

app.listen(PORT, () => {
  console.log(`souvenir-server: placeholder escuchando en :${PORT}`);
});

module.exports = app;
