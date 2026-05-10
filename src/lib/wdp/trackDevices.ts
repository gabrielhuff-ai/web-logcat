// Long-lived client for WDP's `/track-devices-json` endpoint.
//
// WDP design: one global WebSocket subscribes to device-list updates;
// the server pushes a JSON message on every device {dis,}connection
// (and on first connect). Each per-device service stream (shell, sync,
// etc.) lives on its own `/adb-json` WebSocket — see `adbSocket.ts`.
//
// Origin-authorization is integrated into this stream: the first
// message after a fresh-origin connect carries
// `error: { type: 'ORIGIN_NOT_ALLOWLISTED', approveUrl }`. We surface
// it via the `onOriginNotAllowlisted` hook so the UI can drive a
// user-gesture popup; once the user approves we tear down the socket
// and reconnect.

import {
  parseTrackDevicesResponse,
  type WdpDevice,
  type WdpTrackDevicesResponse,
} from './schema';
import { WDP_PROBE_TIMEOUT_MS, WDP_TRACK_DEVICES_URL } from './constants';
import { AsyncWebSocket } from './asyncWebSocket';

export interface WdpTrackerHandlers {
  /** Called every time we receive a full devices snapshot from WDP. */
  onSnapshot: (devices: WdpDevice[]) => void;
  /**
   * Called when WDP rejects this origin. Returns a promise that resolves
   * once the user has interacted with the approve page (popup closed).
   * If the resolved value is `false`, we stop reconnecting.
   *
   * The caller is responsible for opening the popup from a user gesture.
   */
  onOriginNotAllowlisted: (approveUrl: string) => Promise<boolean>;
  /** Called when the connection drops (with reason for diagnostics). */
  onDisconnect?: (reason: string) => void;
  /** Called when the daemon reports a generic error. */
  onError?: (error: { type: string; message: string }) => void;
  /** Called once with the WDP build version on first successful snapshot. */
  onVersion?: (version: string) => void;
}

export class WdpTracker {
  private ws: WebSocket | null = null;
  private disposed = false;

  constructor(private handlers: WdpTrackerHandlers) {}

  /**
   * Open the tracker WebSocket and resolve `true` once the first
   * snapshot is received (i.e. WDP is up and our origin is allowed).
   *
   * Resolves `false` if WDP isn't reachable or the user dismissed the
   * origin-approval popup.
   */
  async start(timeoutMs: number = WDP_PROBE_TIMEOUT_MS): Promise<boolean> {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (this.disposed) return false;
      const aws = await withTimeout(AsyncWebSocket.connect(WDP_TRACK_DEVICES_URL), timeoutMs);
      if (!aws) return false;
      let respStr: string;
      try {
        respStr = await aws.waitForString();
      } catch {
        aws.close();
        return false;
      }
      const parsed = safeParse(respStr);
      if (!parsed) {
        aws.close();
        return false;
      }

      if (parsed.error?.type === 'ORIGIN_NOT_ALLOWLISTED' && parsed.error.approveUrl) {
        aws.close();
        const approved = await this.handlers.onOriginNotAllowlisted(parsed.error.approveUrl);
        if (!approved) return false;
        continue;
      }
      if (parsed.error) {
        aws.close();
        this.handlers.onError?.({ type: parsed.error.type, message: parsed.error.message });
        return false;
      }

      const ws = aws.release();
      this.ws = ws;
      ws.onmessage = (e) => this.onMessage(e);
      ws.onclose = () => this.onClose('closed');
      ws.onerror = () => this.onClose('error');
      this.dispatch(parsed);
      return true;
    }
    return false;
  }

  /** Close the tracker socket. Idempotent. */
  stop(): void {
    this.disposed = true;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    }
  }

  private dispatch(resp: WdpTrackDevicesResponse): void {
    if (resp.version !== undefined) this.handlers.onVersion?.(resp.version);
    this.handlers.onSnapshot(resp.device ?? []);
  }

  private onMessage(e: MessageEvent): void {
    if (typeof e.data !== 'string') return;
    const parsed = safeParse(e.data);
    if (!parsed) return;
    if (parsed.error) {
      this.handlers.onError?.({ type: parsed.error.type, message: parsed.error.message });
      return;
    }
    this.dispatch(parsed);
  }

  private onClose(reason: string): void {
    if (this.disposed) return;
    this.ws = null;
    this.handlers.onDisconnect?.(reason);
  }
}

function safeParse(s: string): WdpTrackDevicesResponse | null {
  try {
    const json = JSON.parse(s);
    const r = parseTrackDevicesResponse(json);
    return r.ok ? r.value : null;
  } catch {
    return null;
  }
}

function withTimeout<T>(p: Promise<T | null>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v: T | null) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    const timer = window.setTimeout(() => finish(null), ms);
    p.then(
      (v) => {
        window.clearTimeout(timer);
        finish(v);
      },
      () => {
        window.clearTimeout(timer);
        finish(null);
      },
    );
  });
}
