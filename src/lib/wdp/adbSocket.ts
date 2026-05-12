// `/adb-json` WebSocket → yume-chan `AdbSocket` adapter.
//
// Protocol (from Perfetto's reference client, Apache 2.0):
//   1. Open WebSocket to `ws://127.0.0.1:9167/adb-json`.
//   2. Send a single TEXT frame: `{ header: { serialNumber, command } }`.
//   3. From then on, both directions exchange BINARY frames carrying the
//      service payload byte-for-byte (no envelope, no length prefix —
//      WebSocket framing already delineates messages).
//   4. Either side closing the socket terminates the service.
//
// We expose the result as a yume-chan `AdbSocket`: a readable byte
// stream of inbound frames, plus a writable that forwards each chunk
// via `ws.send(buffer)`.

import type { AdbSocket } from '@yume-chan/adb';
import { ReadableStream, WritableStream } from '@yume-chan/stream-extra';
import type { Consumable } from '@yume-chan/stream-extra';
import { WDP_ADB_URL } from './constants';

interface OpenAdbSocketOptions {
  serialNumber: string;
  /** ADB service string (e.g. `shell:logcat -v threadtime`, `sync:`, `getprop:`). */
  service: string;
  /** Override the WebSocket URL (used by tests). */
  url?: string;
}

export async function openWdpAdbSocket(opts: OpenAdbSocketOptions): Promise<AdbSocket> {
  const url = opts.url ?? WDP_ADB_URL;
  const ws = await openSocket(url);

  // The header is a single text frame; everything after is binary.
  ws.send(
    JSON.stringify({
      header: {
        serialNumber: opts.serialNumber,
        command: opts.service,
      },
    }),
  );

  return wrapSocket(ws, opts.service);
}

function openSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    ws.binaryType = 'arraybuffer';
    const cleanup = () => {
      ws.onopen = null;
      ws.onerror = null;
      ws.onclose = null;
    };
    ws.onopen = () => {
      cleanup();
      resolve(ws);
    };
    ws.onerror = () => {
      cleanup();
      reject(new Error(`WDP socket failed to open at ${url}`));
    };
    ws.onclose = () => {
      cleanup();
      reject(new Error(`WDP socket closed before open at ${url}`));
    };
  });
}

function wrapSocket(ws: WebSocket, service: string): AdbSocket {
  let closeResolver!: () => void;
  const closed = new Promise<undefined>((resolve) => {
    closeResolver = () => resolve(undefined);
  });

  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      ws.onmessage = (e: MessageEvent) => {
        const data = e.data;
        if (data instanceof ArrayBuffer) {
          controller.enqueue(new Uint8Array(data));
          return;
        }
        if (typeof data === 'string') {
          // Out-of-band error envelope. WDP normally only sends binary after
          // the header; a text frame means the daemon rejected the service.
          controller.error(new Error(`WDP returned text frame mid-stream: ${data}`));
          return;
        }
        // Blob fallback — convert and enqueue. Shouldn't happen because we
        // forced `binaryType = 'arraybuffer'`, but it's cheap insurance.
        if (data instanceof Blob) {
          void data.arrayBuffer().then((buf) => controller.enqueue(new Uint8Array(buf)));
        }
      };
      ws.onerror = () => controller.error(new Error('WDP socket error'));
      ws.onclose = () => {
        try {
          controller.close();
        } catch {
          /* already errored */
        }
        closeResolver();
      };
    },
    cancel() {
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    },
  });

  const writable = new WritableStream<Uint8Array | Consumable<Uint8Array>>({
    write(chunk) {
      const bytes = unwrap(chunk);
      // Copy into an ArrayBuffer slice so the socket doesn't see SharedArrayBuffer-backed views.
      ws.send(bytes.slice().buffer);
      consume(chunk);
    },
    close() {
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    },
    abort() {
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    },
  });

  return {
    service,
    readable,
    writable,
    closed,
    close() {
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    },
  };
}

function unwrap(chunk: Uint8Array | Consumable<Uint8Array>): Uint8Array {
  const maybe = chunk as { value?: unknown };
  if (maybe && typeof maybe === 'object' && maybe.value instanceof Uint8Array) {
    return maybe.value;
  }
  return chunk as Uint8Array;
}

function consume(chunk: Uint8Array | Consumable<Uint8Array>): void {
  const maybe = chunk as { consume?: () => void };
  if (typeof maybe?.consume === 'function') {
    try {
      maybe.consume();
    } catch {
      /* already consumed */
    }
  }
}
