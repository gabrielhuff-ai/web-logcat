// Popup-window helper for WDP origin authorization.
//
// When a new web origin first contacts WDP, the daemon responds with
// `{ error: { type: 'ORIGIN_NOT_ALLOWLISTED', approveUrl } }`. The
// approveUrl is a Google-served page where the user clicks "allow"; the
// daemon then accepts subsequent connections from this origin. The same
// flow runs per-device for `PROXY_UNAUTHORIZED`.
//
// Browsers only let `window.open` succeed inside a user-gesture handler,
// so this helper must be called synchronously from a click handler — not
// from `useEffect` or a deferred callback.

export interface OpenApprovePopupOptions {
  url: string;
  /** Polling interval for the closed-detection loop. */
  pollMs?: number;
}

/**
 * Open `url` in a popup, resolve `true` when the user closes it.
 *
 * Resolves `false` if the browser blocked the popup (returns null from
 * `window.open`). The Promise never rejects — popup-blockers are a UX
 * issue surfaced through the boolean return.
 */
export function openApprovePopup(opts: OpenApprovePopupOptions): Promise<boolean> {
  const { url, pollMs = 400 } = opts;
  return new Promise((resolve) => {
    const popup = window.open(url, 'wdp-approve', 'popup=yes,width=520,height=640');
    if (!popup) {
      resolve(false);
      return;
    }
    const timer = window.setInterval(() => {
      if (popup.closed) {
        window.clearInterval(timer);
        resolve(true);
      }
    }, pollMs);
  });
}
