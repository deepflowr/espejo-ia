/**
 * WebSocket client that connects to the Vision Service (port 3001).
 *
 * Listens for JSON events (presence, gesture, photo, swap_frame)
 * and calls the appropriate callback.
 */

const WebSocket = require('ws');

class VisionClient {
  constructor(port = 3001) {
    this.port = port;
    this.connection = null;

    // Callbacks to be set by the orchestrator
    this.onPresence = null;
    this.onGesture = null;
    this.onPhotoReady = null;
    this.onSwapFrame = null;
    this.onFrame = null; // raw binary frame for live preview
    this.onFaceTracking = null; // normalized face coordinates
  }

  connect() {
    console.log(`Connecting to Vision Service at ws://localhost:${this.port}`);
    this.connection = new WebSocket(`ws://localhost:${this.port}`);

    this.connection.on('open', () => {
      console.log('Connected to Vision Service');
    });

    this.connection.on('message', (raw) => {
      try {
        // Try to parse as JSON first (structured events)
        const data = JSON.parse(raw);
        this._handleEvent(data);
      } catch {
        // Binary frame (raw JPEG) — forward for live preview
        if (raw instanceof Buffer) {
          this.onFrame?.(raw);
          // Also try as swap_frame (base64) for the orchestrator
          const b64 = raw.toString('base64');
          this.onSwapFrame?.(b64);
        }
      }
    });

    this.connection.on('close', () => {
      console.log('Disconnected from Vision Service. Retrying in 5 seconds...');
      setTimeout(() => this.connect(), 5000);
    });

    this.connection.on('error', (error) => {
      console.error(`Vision Service error: ${error.message}`);
    });
  }

  _handleEvent(data) {
    switch (data.type) {
      case 'presence':
        this.onPresence?.(data.value);
        break;
      case 'gesture_detected':
        this.onGesture?.(data.gesture);
        break;
      case 'photo_ready':
        this.onPhotoReady?.(data.image_b64);
        break;
      case 'swap_frame':
        this.onSwapFrame?.(data.image_b64);
        break;
      case 'face_tracking':
        this.onFaceTracking?.(data);
        break;
      default:
        console.log('Unknown event from Vision Service:', data.type);
    }
  }

  send(data) {
    if (this.connection && this.connection.readyState === WebSocket.OPEN) {
      this.connection.send(JSON.stringify(data));
    } else {
      console.warn('Cannot send to Vision Service: not connected');
    }
  }
}

module.exports = new VisionClient();
