// Persisted "preferred connect method" used by the empty-state primary
// button. Defaults to WebUSB until the user successfully connects via
// the proxy once; from then on the primary button uses the proxy first.
// The arrow dropdown always lets the user pick the other path explicitly.

const STORAGE_KEY = 'weblogcat:preferred-transport:v1';

export type PreferredTransport = 'usb' | 'proxy';

export function readPreferredTransport(): PreferredTransport {
  if (typeof localStorage === 'undefined') return 'usb';
  try {
    return localStorage.getItem(STORAGE_KEY) === 'proxy' ? 'proxy' : 'usb';
  } catch {
    return 'usb';
  }
}

export function writePreferredTransport(t: PreferredTransport): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, t);
  } catch {
    /* private mode / quota */
  }
}

/** Test-only — clears the persisted value between suites. */
export function resetPreferredTransportForTest(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
