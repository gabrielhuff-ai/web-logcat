// Custom theme: extends VitePress's default theme with our brand
// CSS overrides (indigo accent, JetBrains Mono, larger hero,
// outline icons on the landing features) and a runtime fixer
// that points "Open WebLogcat" links at the live app on the same
// host, regardless of which docs page the user is on.

import type { EnhanceAppContext } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import './style.css';

/**
 * The docs site is published at `<app-base>/docs/...` (and locally
 * at `/...` during `vitepress dev`). Strip the `/docs/...` segment
 * from the current pathname to reconstruct the live-app URL.
 *
 * Examples — pathname → app URL:
 *   /web-logcat/staging/docs/                  → /web-logcat/staging/
 *   /web-logcat/docs/features/logcat           → /web-logcat/
 *   /web-logcat/docs                           → /web-logcat/
 *   /                                          → /            (dev)
 */
function computeAppUrl(): string {
  if (typeof window === 'undefined') return '/';
  const path = window.location.pathname;
  const idx = path.indexOf('/docs/');
  if (idx !== -1) return path.slice(0, idx + 1);
  if (path.endsWith('/docs')) return path.slice(0, -'/docs'.length) + '/';
  return '/';
}

/**
 * Fix every "Open WebLogcat" anchor on the page so it points at the
 * computed app URL and opens in a new tab. Anchors are matched by:
 *   - `data-app-link` attribute (set in markdown via raw HTML), OR
 *   - href ending in the placeholder token `__open_app__` (used by
 *     the navbar config + landing action button — both of which
 *     ship through VitePress's static config and can't carry a
 *     `data-*` attribute).
 *
 * Idempotent: skips anchors that have already been bound.
 */
function fixAppLinks(): void {
  const appUrl = computeAppUrl();
  const selectors = ['a[data-app-link]', 'a[href*="__open_app__"]'];
  document
    .querySelectorAll<HTMLAnchorElement>(selectors.join(','))
    .forEach((a) => {
      a.setAttribute('href', appUrl);
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
      if (a.dataset.appLinkBound === '1') return;
      a.dataset.appLinkBound = '1';
      // Click handler as a defensive backup. Without this, VitePress's
      // VPLink/VPButton would call its `onClick` and try to navigate
      // via Vue Router for any link starting with `/`. With
      // `target="_blank"` set above the click handler bails early —
      // but we capture the click anyway so the destination is always
      // the recomputed app URL even if the static href has gone stale
      // (e.g. between a route change and the next requestAnimationFrame
      // when this function re-runs).
      a.addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        window.open(computeAppUrl(), '_blank', 'noopener');
      });
    });
}

export default {
  extends: DefaultTheme,
  enhanceApp({ router }: EnhanceAppContext) {
    if (typeof window === 'undefined') return;
    // Run on initial paint…
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fixAppLinks);
    } else {
      fixAppLinks();
    }
    // …and after every SPA route change. VitePress's `onAfterRouteChange`
    // fires before the new view is fully painted; defer one frame so
    // the new anchors are in the DOM by the time we query for them.
    const prev = router.onAfterRouteChange;
    router.onAfterRouteChange = (to: string) => {
      prev?.(to);
      requestAnimationFrame(fixAppLinks);
    };
  },
};
