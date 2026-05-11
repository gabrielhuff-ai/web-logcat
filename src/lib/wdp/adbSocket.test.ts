// Tests for the /adb-json WebSocket -> AdbSocket adapter. We swap a
// minimal in-memory WebSocket polyfill into globalThis and verify the
// JSON header is sent first, that inbound binary frames surface on the
// AdbSocket's readable, and that writes are forwarded as binary.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openWdpAdbSocket } from './adbSocket';

interface SentFrame {
  kind: 'text' | 'binary';
  data: string | ArrayBuffer;
}

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  binaryType: 'arraybuffer' | 'blob' = 'blob';
  readyState = 0;
  sent: SentFrame[] = [];
  onopen: ((ev?: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev?: Event) => void) | null = null;
  onclose: ((ev?: CloseEvent) => void) | null = null;
  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.();
    });
  }
  send(data: string | ArrayBuffer | ArrayBufferView): void {
    if (typeof data === 'string') {
      this.sent.push({ kind: 'text', data });
    } else if (data instanceof ArrayBuffer) {
      this.sent.push({ kind: 'binary', data });
    } else {
      // ArrayBufferView (e.g. Uint8Array) — copy the bytes into a fresh buffer.
      const view = data as ArrayBufferView;
      const copy = new Uint8Array(view.byteLength);
      copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
      this.sent.push({ kind: 'binary', data: copy.buffer });
    }
  }
  close(): void {
    this.readyState = 3;
    this.onclose?.({ code: 1000, reason: '', wasClean: true } as CloseEvent);
  }
  // Test helpers.
  pushBinary(bytes: Uint8Array): void {
    const buf = bytes.slice().buffer;
    this.onmessage?.({ data: buf } as MessageEvent);
  }
  pushText(text: string): void {
    this.onmessage?.({ data: text } as MessageEvent);
  }
}

const globalWithWS = globalThis as { WebSocket?: typeof WebSocket };
let originalWS: typeof WebSocket | undefined;

beforeEach(() => {
  FakeWebSocket.instances = [];
  originalWS = globalWithWS.WebSocket;
  globalWithWS.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
});

afterEach(() => {
  if (originalWS) globalWithWS.WebSocket = originalWS;
  else delete globalWithWS.WebSocket;
});

describe('openWdpAdbSocket', () => {
  it('sends the JSON header first frame', async () => {
    const sock = await openWdpAdbSocket({
      serialNumber: 'serial-abc',
      service: 'shell:logcat -v threadtime',
      url: 'ws://localhost:9999/adb-json',
    });
    const ws = FakeWebSocket.instances[0];
    expect(ws.sent[0]).toEqual({
      kind: 'text',
      data: JSON.stringify({
        header: {
          serialNumber: 'serial-abc',
          command: 'shell:logcat -v threadtime',
        },
      }),
    });
    expect(sock.service).toBe('shell:logcat -v threadtime');
  });

  it('exposes inbound binary frames on the readable stream', async () => {
    const sock = await openWdpAdbSocket({
      serialNumber: 's',
      service: 'shell:echo hi',
      url: 'ws://localhost:9999/adb-json',
    });
    const ws = FakeWebSocket.instances[0];
    ws.pushBinary(new Uint8Array([1, 2, 3]));
    ws.pushBinary(new Uint8Array([4, 5]));
    const reader = sock.readable.getReader();
    const a = await reader.read();
    const b = await reader.read();
    expect(Array.from(a.value!)).toEqual([1, 2, 3]);
    expect(Array.from(b.value!)).toEqual([4, 5]);
  });

  it('forwards writable chunks as binary frames', async () => {
    const sock = await openWdpAdbSocket({
      serialNumber: 's',
      service: 'shell:cat',
      url: 'ws://localhost:9999/adb-json',
    });
    const ws = FakeWebSocket.instances[0];
    const writer = sock.writable.getWriter();
    await writer.write(new Uint8Array([10, 20, 30]));
    // sent[0] is the JSON header; sent[1] should be the binary chunk.
    expect(ws.sent[1].kind).toBe('binary');
    expect(Array.from(new Uint8Array(ws.sent[1].data as ArrayBuffer))).toEqual([10, 20, 30]);
  });

  it('errors the readable on an out-of-band text frame', async () => {
    const sock = await openWdpAdbSocket({
      serialNumber: 's',
      service: 'shell:noop',
      url: 'ws://localhost:9999/adb-json',
    });
    const ws = FakeWebSocket.instances[0];
    const reader = sock.readable.getReader();
    ws.pushText('{"error":"nope"}');
    await expect(reader.read()).rejects.toThrow(/text frame/);
  });

  it('resolves closed when the WebSocket closes', async () => {
    const sock = await openWdpAdbSocket({
      serialNumber: 's',
      service: 'shell:noop',
      url: 'ws://localhost:9999/adb-json',
    });
    const ws = FakeWebSocket.instances[0];
    let resolved = false;
    void sock.closed.then(() => {
      resolved = true;
    });
    ws.close();
    // Give the microtask queue a chance to settle.
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(true);
  });
});
