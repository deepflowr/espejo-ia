/**
 * WebSocket client — connects to the orchestrator (port 3000).
 *
 * Currently a skeleton ready to wire when we connect the frontend
 * to the live vision service via the orchestrator.
 */

export type WsMessage = Record<string, unknown>;

export class WsClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  public onMessage: ((data: WsMessage) => void) | null = null;
  public onStateChange: ((state: string) => void) | null = null;
  public onBinary: ((blob: Blob) => void) | null = null;

  constructor(url: string = 'ws://localhost:3000') {
    this.url = url;
  }

  connect() {
    console.log(`[WsClient] Connecting to ${this.url}...`);
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('[WsClient] Connected to orchestrator');
      this.send({ type: 'hello' });
    };

    this.ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const data = JSON.parse(event.data);
          this.handleEvent(data);
          this.onMessage?.(data);
        } catch {
          // ignore non-JSON strings
        }
      } else if (event.data instanceof Blob) {
        this.onBinary?.(event.data);
      }
    };

    this.ws.onclose = () => {
      console.log('[WsClient] Disconnected. Retrying in 3s...');
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  send(data: WsMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private handleEvent(data: WsMessage) {
    if (data.type === 'state' && typeof data.state === 'string') {
      this.onStateChange?.(data.state);
    }
  }
}
