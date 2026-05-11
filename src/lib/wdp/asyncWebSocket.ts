// Tiny promise-based wrapper for the first message of a WebSocket
// handshake. Modelled on Perfetto's `AsyncWebsocket` (Apache 2.0) but
// trimmed to what we actually use: `connect()` that resolves once the
// socket is open (or null on failure), and `waitForString()` that
// resolves on the next text frame.

export class AsyncWebSocket {
  private constructor(public readonly ws: WebSocket) {}

  /** Open a WebSocket and resolve once it's open. Resolves to `null` on error / close-before-open. */
  static connect(url: string): Promise<AsyncWebSocket | null> {
    return new Promise((resolve) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        resolve(null);
        return;
      }
      const cleanup = () => {
        ws.onopen = null;
        ws.onerror = null;
        ws.onclose = null;
      };
      ws.onopen = () => {
        cleanup();
        resolve(new AsyncWebSocket(ws));
      };
      ws.onerror = () => {
        cleanup();
        try {
          ws.close();
        } catch {
          /* already closed */
        }
        resolve(null);
      };
      ws.onclose = () => {
        cleanup();
        resolve(null);
      };
    });
  }

  /** Resolve with the next text frame. Rejects on error / close before a frame arrives. */
  waitForString(): Promise<string> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
      };
      this.ws.onmessage = (e: MessageEvent) => {
        cleanup();
        if (typeof e.data === 'string') {
          resolve(e.data);
        } else {
          reject(new Error('Expected text frame from WDP, got binary'));
        }
      };
      this.ws.onerror = () => {
        cleanup();
        reject(new Error('WebSocket error'));
      };
      this.ws.onclose = () => {
        cleanup();
        reject(new Error('WebSocket closed before message'));
      };
    });
  }

  /** Hand the underlying WebSocket back to the caller. After this, `this` is no longer valid. */
  release(): WebSocket {
    return this.ws;
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}
