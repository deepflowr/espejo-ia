# souvenir-server — Servidor remoto del souvenir

**Estado: ⚠ PLACEHOLDER — sin implementar.** Arquitectura definida el 2026-09-06 (ver `docs/espejo-arquitectura-tecnica.md` §8).

## Rol

Servidor **remoto en internet** (dominio público, HTTPS) que recibe, durante la visita, los assets
de cada sesión (empujados en vivo por el Orchestrator de la instalación) y, cuando el visitante
manda su mail desde el QR, arma y envía el correo con su **propio SMTP**.

## Piezas

| Archivo | Rol |
|---------|-----|
| `src/server.js` | Arranca la web + la API (express) |
| `src/api.js` | REST: ingest de assets, guardar email, estado de sesión |
| `src/db.js` | Persistencia de sesiones (`session_id → assets + email`) |
| `src/mail-sender.js` | Arma el mail (template + assets) y lo envía por SMTP |
| `public/index.html` | Mini-página del form de mail (target del QR) |
| `templates/souvenir.html` | Template del mail |

## Contrato (resumen)

- `POST /api/sessions/<id>/assets` — el Orchestrator sube cada asset apenas se genera
  (`{ type: 'photo'|'descripcion'|'prompt_en'|'prompt_es'|'portrait', data_b64 }`).
- `GET /souvenir?session=<id>` — mini-página (form de mail) a la que apunta el QR.
- `POST /api/sessions/<id>/email` — el celular registra `{ email }`.
- Envío: cuando una sesión tiene `email` + assets completos, `mail-sender` arma y envía.
