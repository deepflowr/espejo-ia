/**
 * WebSocket server for frontend communication.
 *
 * Receives `hello` from the frontend on connect.
 * Broadcasts state changes and events from the orchestrator.
 */

const { STATES } = require('../stateMachine');

function setupUiServer(wss, stateMachine, visionClient, getSessionId) {
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
          // If we're in a state that requires a session but none exists, reset
          const needsSession = [STATES.CONGELADO, STATES.LECTURA];
          if (needsSession.includes(stateMachine.state) && !getSessionId()) {
            console.log('Stale session detected — resetting to REPOSO');
            stateMachine.reset();
          }
          // If flow completed (GENERACION+), reset for next run
          const completedStates = [STATES.GENERACION, STATES.REVELACION, STATES.ESPEJO_ACTIVO, STATES.SOUVENIR, STATES.CIERRE];
          if (completedStates.includes(stateMachine.state)) {
            console.log('Previous flow completed — resetting to REPOSO');
            stateMachine.reset();
          }
        }
        if (data.type === 'continue') {
          console.log('Frontend signaled continue — advancing state');
          if (stateMachine.state === STATES.DESPERTAR) {
            stateMachine.transition(STATES.CAPTURA);
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
