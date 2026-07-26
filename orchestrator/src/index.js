/**
 * Orchestrator — main entry point for El Espejo.
 *
 * Responsibilities:
 * - Express + HTTP server (port 3000)
 * - WebSocket server for frontend communication
 * - WebSocket client to Vision Service (port 3001)
 * - State machine for the experience flow
 * - Session management
 */

const express = require('express');
const http = require('http');
const { Server } = require('ws');
const { StateMachine, STATES } = require('./stateMachine');
const sessionStore = require('./session');
const visionClient = require('./ws/visionClient');
const { setupUiServer } = require('./ws/uiServer');
const ollamaService = require('./services/ollama');
const comfyuiService = require('./services/comfyui');

// ─── App setup ────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '50mb' }));

const server = http.createServer(app);
const wss = new Server({ server });

const PORT = process.env.PORT || 3000;

// ─── State machine ────────────────────────────────────────────
const stateMachine = new StateMachine();
let currentSessionId = null;

// ─── Broadcast helpers ────────────────────────────────────────
function broadcast(data) {
  const message = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(message);
    }
  });
}

function broadcastBinary(buffer) {
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(buffer);
    }
  });
}

// When state changes, tell all connected frontends
stateMachine.onChange((newState) => {
  broadcast({ type: 'state', state: newState });

  if (newState === STATES.CAPTURA) {
    // Countdown handled by frontend — just log the transition
    console.log('CAPTURA — waiting for frontend countdown + capture');
  }

  if (newState === STATES.LECTURA) {
    // Start Ollama streaming with the captured photo
    const session = sessionStore.get(currentSessionId);
    if (session && session.photo) {
      console.log('LECTURA — starting Ollama stream...');
      ollamaService.startStream(
        session.photo,
        // onChunk — forward to frontend as stream_chunk
        (chunk) => {
          broadcast({ type: 'stream_chunk', ...chunk });
          // Also log periodically for debugging
          if (chunk.done) {
            console.log(`Ollama stream chunk done: ${chunk.channel}`);
          }
        },
        // onComplete — save to session and advance to GENERACION
        (result) => {
          console.log('=== Ollama complete ===');
          const logLong = (label, text) => {
            if (!text) { console.log(label + ':', '(empty)'); return; }
            for (let i = 0; i < text.length; i += 400) {
              const prefix = i === 0 ? label + ':' : label + '..';
              console.log(prefix, text.slice(i, i + 400));
            }
          };
          logLong('THINKING (ES)', result.pensamiento_es);
          logLong('DESCRIPCION', result.descripcion);
          logLong('PROMPT_EN', result.prompt_en);
          logLong('PROMPT_ES', result.prompt_es);
          console.log('=======================');

          sessionStore.set(currentSessionId, 'pensamiento_es', result.pensamiento_es || '');
          sessionStore.set(currentSessionId, 'descripcion', result.descripcion || '');
          sessionStore.set(currentSessionId, 'prompt_en', result.prompt_en);
          sessionStore.set(currentSessionId, 'prompt_es', result.prompt_es);
          // Advance to GENERACION after a brief pause
          setTimeout(() => {
            if (stateMachine.state === STATES.LECTURA) {
              stateMachine.transition(STATES.GENERACION);
            }
          }, 1000);
        },
        // onError
        (err) => {
          console.error('Ollama error:', err.message);
          broadcast({ type: 'error', message: 'Error al generar la narración' });
          // Still advance to avoid getting stuck
          setTimeout(() => {
            if (stateMachine.state === STATES.LECTURA) {
              stateMachine.transition(STATES.GENERACION);
            }
          }, 3000);
        },
      );
    } else {
      console.warn('LECTURA — no session or photo found');
    }
  }

  if (newState === STATES.GENERACION) {
    // Start ComfyUI generation with the prompt + photo
    const session = sessionStore.get(currentSessionId);
    if (session && session.prompt_en && session.photo) {
      console.log('GENERACION — starting ComfyUI...');
      broadcast({ type: 'gen_start' });
      comfyuiService.generate(
        session.prompt_en,
        session.photo,
        currentSessionId,
        // onPreview
        (preview) => {
          broadcast({ type: 'gen_preview', ...preview });
        },
        // onComplete
        (result) => {
          console.log('=== ComfyUI complete ===');
          sessionStore.set(currentSessionId, 'portrait', result.image_b64);
          broadcast({ type: 'final_portrait', image_b64: result.image_b64 });
          if (stateMachine.state === STATES.GENERACION) {
            stateMachine.transition(STATES.REVELACION);
          }
        },
        // onError
        (err) => {
          console.error('ComfyUI error:', err.message);
          broadcast({ type: 'error', message: 'Error al generar la imagen' });
          if (stateMachine.state === STATES.GENERACION) {
            stateMachine.transition(STATES.REVELACION);
          }
        },
      );
    } else {
      console.warn('GENERACION — no session, prompt, or photo found');
    }
  }

  if (newState === STATES.REPOSO) {
    currentSessionId = null;
  }
});

// ─── Wire up Vision Service events ────────────────────────────
visionClient.onPresence = (present) => {
  // Forward to all frontends so they can update UI
  broadcast({ type: 'presence', value: present });

  if (present && stateMachine.state === STATES.REPOSO) {
    stateMachine.transition(STATES.DESPERTAR);
  } else if (!present && stateMachine.isActive()) {
    // Only reset to REPOSO in early states (before photo is taken)
    // Once we have a capture, the experience continues regardless of presence
    const earlyStates = [STATES.DESPERTAR, STATES.CAPTURA];
    if (earlyStates.includes(stateMachine.state)) {
      stateMachine.reset();
    }
  }
};

visionClient.onGesture = (gesture) => {
  // Forward to frontend so it can react (e.g. advance dialog)
  broadcast({ type: 'gesture_detected', gesture });
  // State transition is now triggered by frontend via 'continue' message
};

visionClient.onPhotoReady = (imageB64) => {
  if (stateMachine.state === STATES.CAPTURA) {
    currentSessionId = sessionStore.create();
    sessionStore.set(currentSessionId, 'photo', imageB64);
    broadcast({ type: 'photo_captured', image_b64: imageB64 });
    stateMachine.transition(STATES.CONGELADO);

    // Show explanation message during CONGELADO
    const messages = [
      "Descubriendo quién eres...",
      "Analizando tu esencia...",
      "Preparando tu historia...",
    ];
    messages.forEach((msg, i) => {
      setTimeout(() => broadcast({ type: 'message', text: msg }), i * 2000);
    });

    // Auto-advance to LECTURA immediately
    if (stateMachine.state === STATES.CONGELADO) {
      stateMachine.transition(STATES.LECTURA);
    }
  }
};

visionClient.onSwapFrame = (imageB64) => {
  if (stateMachine.state === STATES.ESPEJO_ACTIVO) {
    broadcast({ type: 'swap_frame', image_b64: imageB64 });
  }
};

// Forward raw camera frames as binary for live preview (any state)
visionClient.onFrame = (buffer) => {
  broadcastBinary(buffer);
};

// Forward face tracking coordinates to all frontends (any state)
visionClient.onFaceTracking = (data) => {
  broadcast(data);
};

// ─── WebSocket server (frontend) ──────────────────────────────
setupUiServer(wss, stateMachine, visionClient, () => currentSessionId ? sessionStore.has(currentSessionId) ? currentSessionId : null : null);

// ─── REST routes ──────────────────────────────────────────────
const souvenirRoute = require('./routes/souvenir');
app.use('/souvenir', souvenirRoute);

// ─── Start ────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`Orchestrator running on port ${PORT}`);
  visionClient.connect();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  server.close();
  process.exit(0);
});
