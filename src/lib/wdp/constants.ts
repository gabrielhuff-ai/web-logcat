// Wire-level constants for the Android Web Device Proxy transport.
// All values come from Perfetto's open-source client (Apache 2.0); see
// `lib/wdp/schema.ts` for the source citation.

export const WDP_HOST = '127.0.0.1';
export const WDP_PORT = 9167;
export const WDP_BASE_URL = `ws://${WDP_HOST}:${WDP_PORT}`;
export const WDP_TRACK_DEVICES_URL = `${WDP_BASE_URL}/track-devices-json`;
export const WDP_ADB_URL = `${WDP_BASE_URL}/adb-json`;
export const WDP_DOWNLOAD_URL = 'https://tools.google.com/dlpage/android_web_device_proxy';

/** How long to wait for the initial track-devices response before declaring the daemon unreachable. */
export const WDP_PROBE_TIMEOUT_MS = 1500;
