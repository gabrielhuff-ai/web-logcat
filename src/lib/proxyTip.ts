// Persistence for the Device Proxy tip's "don't show again" state.
// Kept separate from the component so the read/write helpers are
// trivially unit-testable.

const STORAGE_KEY = 'weblogcat:proxy-tip:dismissed:v1';

export function isProxyTipDismissed(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markProxyTipDismissed(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* quota / SecurityError — the tip just reappears next reload */
  }
}

/** Test-only — reset dismissal so suites don't leak into each other. */
export function resetProxyTipForTest(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
