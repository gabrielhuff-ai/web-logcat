// Feature flags.
//
// Until the Web Device Proxy transport has been verified against a real
// daemon + device, it's gated behind an opt-in flag so deploys to main
// stay WebUSB-only for normal users. Operators flip the flag on with
// `?wdp=1` (sticky via localStorage); `?wdp=0` clears it. The query
// param is stripped from the URL on read so reloads don't reapply, and
// the address bar stays clean for sharing.

const WDP_STORAGE_KEY = 'weblogcat:flags:wdp:v1';
const WDP_URL_PARAM = 'wdp';

let wdpCached: boolean | null = null;

export function isWdpEnabled(): boolean {
  if (wdpCached !== null) return wdpCached;
  if (typeof window === 'undefined') return false;

  // URL param has highest priority and persists its value to localStorage.
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has(WDP_URL_PARAM)) {
      const raw = params.get(WDP_URL_PARAM);
      const value = raw === '1' || raw === 'true' || raw === 'on';
      try {
        if (value) localStorage.setItem(WDP_STORAGE_KEY, '1');
        else localStorage.removeItem(WDP_STORAGE_KEY);
      } catch {
        /* private mode / quota — fall through with the URL value */
      }
      // Strip the param so reloads don't reapply and the URL stays clean.
      params.delete(WDP_URL_PARAM);
      const search = params.toString();
      const newUrl =
        window.location.pathname + (search ? `?${search}` : '') + window.location.hash;
      try {
        window.history.replaceState(null, '', newUrl);
      } catch {
        /* file:// or sandboxed — best effort */
      }
      wdpCached = value;
      return value;
    }
  } catch {
    /* SecurityError on URL access — fall through */
  }

  try {
    wdpCached = localStorage.getItem(WDP_STORAGE_KEY) === '1';
  } catch {
    wdpCached = false;
  }
  return wdpCached;
}

/** Test-only — reset the in-memory cache so each test resolves the flag fresh. */
export function resetFeatureFlagsForTest(): void {
  wdpCached = null;
}
