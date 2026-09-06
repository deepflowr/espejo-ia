/**
 * WebSocket server for frontend communication.
 *
 * Receives `hello` from the frontend on connect.
 * Broadcasts state changes and events from the orchestrator.
 */

const { STATES } = require('../stateMachine');

function setupUiServer(wss, stateMachine, visionClient, getSessionId, sessionStore) {
  wss.on('connection', (ws) => {
    console.log('Frontend connected via WebSocket');

    // Send current state immediately on connect
    ws.send(JSON.stringify({ type: 'state', state: stateMachine.state }));

    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw);
        console.log('Received from frontend:', data);

        if (data.type === 'hello') {
          console.log('Frontend greeted, ready.');
          const sessionId = getSessionId();
          // If we're in a state that requires a session but none exists, reset
          const needsSession = [STATES.CONGELADO, STATES.LECTURA];
          if (needsSession.includes(stateMachine.state) && !sessionId) {
            console.log('Stale session detected — resetting to REPOSO');
            stateMachine.reset();
          }
          // Si hay una sesión activa a mitad/después del flujo, NO matar el flujo
          // por una recarga del frontend: reenviar datos para que la pantalla resuma.
          const midFlow = [STATES.CONGELADO, STATES.LECTURA, STATES.GENERACION, STATES.REVELACION, STATES.ESPEJO_ACTIVO, STATES.SOUVENIR, STATES.CIERRE];
          if (sessionId && midFlow.includes(stateMachine.state)) {
            const s = sessionStore.get(sessionId);
            const resume = { type: 'session_resume', state: stateMachine.state };
            if (s) {
              if (s.photo) resume.photo_b64 = s.photo;
              if (s.portrait) resume.portrait_b64 = s.portrait;
            }
            ws.send(JSON.stringify(resume));
            console.log(`Frontend resumed session ${sessionId} (${stateMachine.state})`);
          } else if (stateMachine.state !== STATES.REPOSO) {
            // Sin sesión activa: flujo viejo/estancado → reset para la próxima corrida
            const completedStates = [STATES.GENERACION, STATES.REVELACION, STATES.ESPEJO_ACTIVO, STATES.SOUVENIR, STATES.CIERRE];
            if (completedStates.includes(stateMachine.state)) {
              console.log('Previous flow completed — resetting to REPOSO');
              stateMachine.reset();
            }
          }
        }
        if (data.type === 'continue') {
          console.log('Frontend signaled continue — advancing state');
          if (stateMachine.state === STATES.DESPERTAR) {
            stateMachine.transition(STATES.CAPTURA);
          }
        }
        if (data.type === 'start_espejo') {
          console.log('Frontend signaled espejo activo');
          if (stateMachine.state === STATES.REVELACION) {
            stateMachine.transition(STATES.ESPEJO_ACTIVO);
          }
        }
        if (data.type === 'capture_photo') {
          console.log('Frontend requested photo capture');
          // Guard: ensure we're in CAPTURA (continue may have been lost on reconnect)
          if (stateMachine.state === STATES.DESPERTAR) {
            console.log('Was still DESPERTAR — advancing to CAPTURA');
            stateMachine.transition(STATES.CAPTURA);
          }
          const msg = { type: 'capture_photo' };
          if (data.crop_center_x !== undefined) {
            msg.crop_center_x = data.crop_center_x;
            msg.crop_center_y = data.crop_center_y;
            msg.crop_size = data.crop_size;
          }
          visionClient.send(msg);
        }
      } catch (e) {
        console.error('Invalid message from frontend:', e.message);
      }
    });

    ws.on('close', () => {
      console.log('Frontend disconnected');
    });

    ws.on('error', (err) => {
      console.error('Frontend WebSocket error:', err.message);
    });
  });
}

module.exports = { setupUiServer };
