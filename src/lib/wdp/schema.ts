// Wire schema for Android Web Device Proxy's `/track-devices-json`
// endpoint. Derived from Perfetto's open-source client (Apache 2.0):
//
//   ui/src/plugins/dev.perfetto.RecordTraceV2/adb/web_device_proxy/wdp_schema.ts
//
// WDP isn't documented publicly outside Perfetto's UI — the source there is
// the de-facto spec. Perfetto uses zod for validation; the project bans new
// runtime deps so we hand-roll the shape checks here.

export interface WdpDeviceAdb {
  serialNumber: string;
  proxyStatus: 'ADB';
  adbStatus: string;
  adbProps?: Record<string, string>;
}

export interface WdpDeviceUnauthorized {
  serialNumber: string;
  proxyStatus: 'PROXY_UNAUTHORIZED';
  adbStatus: string;
  approveUrl: string;
}

export type WdpDevice = WdpDeviceAdb | WdpDeviceUnauthorized;

export interface WdpTrackDevicesResponse {
  error?: {
    type: string; // e.g. ORIGIN_NOT_ALLOWLISTED
    message: string;
    approveUrl?: string;
  };
  device?: WdpDevice[];
  version?: string;
}

export interface ParseResult<T> {
  ok: true;
  value: T;
}
export interface ParseError {
  ok: false;
  error: string;
}

function isStringRecord(v: unknown): v is Record<string, string> {
  if (typeof v !== 'object' || v === null) return false;
  for (const k in v) {
    if (typeof (v as Record<string, unknown>)[k] !== 'string') return false;
  }
  return true;
}

function parseDevice(d: unknown): WdpDevice | null {
  if (typeof d !== 'object' || d === null) return null;
  const o = d as Record<string, unknown>;
  if (typeof o.serialNumber !== 'string') return null;
  if (o.proxyStatus === 'ADB') {
    if (typeof o.adbStatus !== 'string') return null;
    let adbProps: Record<string, string> | undefined;
    if (o.adbProps !== undefined) {
      if (!isStringRecord(o.adbProps)) return null;
      adbProps = o.adbProps;
    }
    return {
      serialNumber: o.serialNumber,
      proxyStatus: 'ADB',
      adbStatus: o.adbStatus,
      adbProps,
    };
  }
  if (o.proxyStatus === 'PROXY_UNAUTHORIZED') {
    if (typeof o.adbStatus !== 'string') return null;
    if (typeof o.approveUrl !== 'string') return null;
    return {
      serialNumber: o.serialNumber,
      proxyStatus: 'PROXY_UNAUTHORIZED',
      adbStatus: o.adbStatus,
      approveUrl: o.approveUrl,
    };
  }
  return null;
}

export function parseTrackDevicesResponse(
  raw: unknown,
): ParseResult<WdpTrackDevicesResponse> | ParseError {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'response is not an object' };
  }
  const o = raw as Record<string, unknown>;
  const out: WdpTrackDevicesResponse = {};

  if (o.error !== undefined) {
    if (typeof o.error !== 'object' || o.error === null) {
      return { ok: false, error: 'error must be an object' };
    }
    const e = o.error as Record<string, unknown>;
    if (typeof e.type !== 'string' || typeof e.message !== 'string') {
      return { ok: false, error: 'error.type and error.message must be strings' };
    }
    out.error = { type: e.type, message: e.message };
    if (e.approveUrl !== undefined) {
      if (typeof e.approveUrl !== 'string') {
        return { ok: false, error: 'error.approveUrl must be a string' };
      }
      out.error.approveUrl = e.approveUrl;
    }
  }

  if (o.device !== undefined) {
    if (!Array.isArray(o.device)) {
      return { ok: false, error: 'device must be an array' };
    }
    const devs: WdpDevice[] = [];
    for (const raw of o.device) {
      const d = parseDevice(raw);
      if (!d) return { ok: false, error: `invalid device entry: ${JSON.stringify(raw)}` };
      devs.push(d);
    }
    out.device = devs;
  }

  if (o.version !== undefined) {
    if (typeof o.version !== 'string') {
      return { ok: false, error: 'version must be a string' };
    }
    out.version = o.version;
  }

  return { ok: true, value: out };
}

/** Stable status string for diagnostics + UI labels. */
export function wdpDeviceStatus(d: WdpDevice): string {
  if (d.proxyStatus === 'ADB') return d.adbStatus;
  return d.proxyStatus;
}

/** True when the device is ready to open `/adb-json` sockets. */
export function wdpDeviceReady(d: WdpDevice): boolean {
  return d.proxyStatus === 'ADB' && d.adbStatus === 'DEVICE';
}
