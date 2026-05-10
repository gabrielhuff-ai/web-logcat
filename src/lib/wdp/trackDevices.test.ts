// Tests for the /track-devices-json client. We swap in a programmable
// fake WebSocket so we can drive each branch (initial snapshot, origin
// rejection + retry, subsequent updates, error envelope).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WdpTracker } from './trackDevices';

// Fake WebSocket that buffers inbound messages until a handler is
// attached, so tests don't have to synchronise on the tracker's await
// boundaries.
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  readyState = 0;
  private _onmessage: ((ev: MessageEvent) => void) | null = null;
  private _onclose: ((ev?: CloseEvent) => void) | null = null;
  private _buffer: string[] = [];
  private _closedPending = false;
  onopen: ((ev?: Event) => void) | null = null;
  onerror: ((ev?: Event) => void) | null = null;
  set onmessage(fn: ((ev: MessageEvent) => void) | null) {
    this._onmessage = fn;
    if (fn && this._buffer.length > 0) {
      const buf = this._buffer;
      this._buffer = [];
      for (const data of buf) fn({ data } as MessageEvent);
    }
  }
  get onmessage(): ((ev: MessageEvent) => void) | null {
    return this._onmessage;
  }
  set onclose(fn: ((ev?: CloseEvent) => void) | null) {
    this._onclose = fn;
    if (fn && this._closedPending) {
      this._closedPending = false;
      fn();
    }
  }
  get onclose(): ((ev?: CloseEvent) => void) | null {
    return this._onclose;
  }
  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.();
    });
  }
  send(): void {
    /* tracker doesn't send anything outbound */
  }
  close(): void {
    this.readyState = 3;
    if (this._onclose) this._onclose();
    else this._closedPending = true;
  }
  pushText(s: string): void {
    if (this._onmessage) this._onmessage({ data: s } as MessageEvent);
    else this._buffer.push(s);
  }
}

const globalWithWS = globalThis as {
  WebSocket?: typeof WebSocket;
  window?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout };
};
let originalWS: typeof WebSocket | undefined;

beforeEach(() => {
  FakeWebSocket.instances = [];
  originalWS = globalWithWS.WebSocket;
  globalWithWS.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  if (!globalWithWS.window) {
    globalWithWS.window = { setTimeout, clearTimeout };
  }
});

afterEach(() => {
  if (originalWS) globalWithWS.WebSocket = originalWS;
  else delete globalWithWS.WebSocket;
});

async function waitForInstance(i: number, maxTicks = 20): Promise<FakeWebSocket> {
  for (let n = 0; n < maxTicks; n++) {
    if (FakeWebSocket.instances[i]) return FakeWebSocket.instances[i];
    await Promise.resolve();
  }
  throw new Error(`FakeWebSocket instance ${i} did not appear within ${maxTicks} ticks`);
}

describe('WdpTracker', () => {
  it('delivers the initial snapshot to onSnapshot and resolves true', async () => {
    const snapshots: unknown[] = [];
    let resolvedVersion = '';
    const tracker = new WdpTracker({
      onSnapshot: (devs) => snapshots.push(devs),
      onVersion: (v) => {
        resolvedVersion = v;
      },
      onOriginNotAllowlisted: () => Promise.resolve(false),
    });
    const startPromise = tracker.start();
    // wait for ws constructor + onopen to fire
    await Promise.resolve();
    await Promise.resolve();
    const ws = FakeWebSocket.instances[0];
    ws.pushText(
      JSON.stringify({
        version: 'wdp-1.2',
        device: [
          { serialNumber: 's1', proxyStatus: 'ADB', adbStatus: 'DEVICE' },
        ],
      }),
    );
    const ok = await startPromise;
    expect(ok).toBe(true);
    expect(snapshots).toHaveLength(1);
    expect(resolvedVersion).toBe('wdp-1.2');
    tracker.stop();
  });

  it('retries after origin-approval and succeeds on the second attempt', async () => {
    const onApprove = vi.fn().mockResolvedValue(true);
    const snapshots: unknown[] = [];
    const tracker = new WdpTracker({
      onSnapshot: (devs) => snapshots.push(devs),
      onOriginNotAllowlisted: onApprove,
    });
    const startPromise = tracker.start();
    // Push the ORIGIN_NOT_ALLOWLISTED response (buffered if onmessage isn't set yet).
    const firstWs = await waitForInstance(0);
    firstWs.pushText(
      JSON.stringify({
        error: {
          type: 'ORIGIN_NOT_ALLOWLISTED',
          message: 'allowlist me',
          approveUrl: 'https://example.com/approve',
        },
      }),
    );
    // Tracker reopens after approval — wait for the second instance.
    const secondWs = await waitForInstance(1);
    secondWs.pushText(
      JSON.stringify({ device: [{ serialNumber: 's', proxyStatus: 'ADB', adbStatus: 'DEVICE' }] }),
    );
    const ok = await startPromise;
    expect(ok).toBe(true);
    expect(onApprove).toHaveBeenCalledWith('https://example.com/approve');
    expect(snapshots).toHaveLength(1);
    tracker.stop();
  });

  it('resolves false if the user dismisses the approve popup', async () => {
    const tracker = new WdpTracker({
      onSnapshot: () => {},
      onOriginNotAllowlisted: () => Promise.resolve(false),
    });
    const startPromise = tracker.start();
    await Promise.resolve();
    await Promise.resolve();
    FakeWebSocket.instances[0].pushText(
      JSON.stringify({
        error: {
          type: 'ORIGIN_NOT_ALLOWLISTED',
          message: '...',
          approveUrl: 'https://example.com/approve',
        },
      }),
    );
    const ok = await startPromise;
    expect(ok).toBe(false);
    tracker.stop();
  });

  it('dispatches subsequent snapshots after the initial one', async () => {
    const snapshots: unknown[][] = [];
    const tracker = new WdpTracker({
      onSnapshot: (devs) => snapshots.push(devs as unknown[]),
      onOriginNotAllowlisted: () => Promise.resolve(false),
    });
    const startPromise = tracker.start();
    await Promise.resolve();
    await Promise.resolve();
    const ws = FakeWebSocket.instances[0];
    ws.pushText(JSON.stringify({ device: [] }));
    await startPromise;
    ws.pushText(
      JSON.stringify({
        device: [{ serialNumber: 's1', proxyStatus: 'ADB', adbStatus: 'DEVICE' }],
      }),
    );
    ws.pushText(
      JSON.stringify({
        device: [
          { serialNumber: 's1', proxyStatus: 'ADB', adbStatus: 'DEVICE' },
          { serialNumber: 's2', proxyStatus: 'ADB', adbStatus: 'OFFLINE' },
        ],
      }),
    );
    expect(snapshots).toHaveLength(3);
    expect(snapshots[2]).toHaveLength(2);
    tracker.stop();
  });
});
