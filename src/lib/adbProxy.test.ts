// Unit tests for the Device Proxy probe. The connect path is a stub
// (protocol not yet known) — see lib/adbProxy.ts — so we only cover
// reachability semantics and the timeout fallback here.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectViaProxy, probeProxyAvailability } from './adbProxy';

// Vitest runs in node by default; the production code uses
// `window.setTimeout` / `clearTimeout` (browser-typed) so the test
// pretends to be a browser by aliasing the node globals.
const globalWithWindow = globalThis as { window?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout } };
if (!globalWithWindow.window) {
  globalWithWindow.window = { setTimeout, clearTimeout };
}

type Listener = (() => void) | null;

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  onopen: Listener = null;
  onerror: Listener = null;
  onclose: Listener = null;
  closed = false;
  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }
  close() {
    this.closed = true;
  }
  // Helpers for tests to drive the socket lifecycle deterministically.
  open() {
    this.onopen?.();
  }
  error() {
    this.onerror?.();
  }
}

describe('probeProxyAvailability', () => {
  let originalWS: typeof WebSocket | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    originalWS = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
    (globalThis as { WebSocket?: unknown }).WebSocket =
      FakeWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalWS) {
      (globalThis as { WebSocket?: typeof WebSocket }).WebSocket = originalWS;
    } else {
      delete (globalThis as { WebSocket?: unknown }).WebSocket;
    }
  });

  it('reports reachable when the socket opens', async () => {
    const promise = probeProxyAvailability('ws://127.0.0.1:9999', 500);
    // Give the WebSocket constructor a microtask to register listeners.
    await Promise.resolve();
    const ws = FakeWebSocket.instances[0];
    expect(ws).toBeDefined();
    ws!.open();
    const result = await promise;
    expect(result.reachable).toBe(true);
    expect(result.endpoint).toBe('ws://127.0.0.1:9999');
    expect(ws!.closed).toBe(true);
  });

  it('reports unreachable when the socket errors', async () => {
    const promise = probeProxyAvailability('ws://127.0.0.1:9999', 500);
    await Promise.resolve();
    FakeWebSocket.instances[0]!.error();
    const result = await promise;
    expect(result.reachable).toBe(false);
  });

  it('times out when the socket neither opens nor errors', async () => {
    const promise = probeProxyAvailability('ws://127.0.0.1:9999', 100);
    await Promise.resolve();
    vi.advanceTimersByTime(100);
    const result = await promise;
    expect(result.reachable).toBe(false);
    expect(FakeWebSocket.instances[0]!.closed).toBe(true);
  });

  it('settles only once even if multiple events fire', async () => {
    const promise = probeProxyAvailability('ws://127.0.0.1:9999', 500);
    await Promise.resolve();
    const ws = FakeWebSocket.instances[0]!;
    ws.open();
    ws.error(); // late error after open should not flip the result
    const result = await promise;
    expect(result.reachable).toBe(true);
  });
});

describe('connectViaProxy', () => {
  it('rejects with a clear "not implemented" message until the protocol is wired up', async () => {
    await expect(connectViaProxy()).rejects.toThrow(/not yet implemented/i);
  });
});
