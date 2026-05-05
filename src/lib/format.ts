// Small formatting + layout helpers shared across the UI.

import type { Tweaks } from '../types';

export function formatTs(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

/** Estimated pixel height of one log row at the given density. Used by
 *  the virtualiser as `estimateSize` and by `App.tsx` to compute the
 *  trim-anchor compensation. */
export function rowHeightFor(density: Tweaks['density']): number {
  if (density === 'compact') return 22;
  if (density === 'comfortable') return 32;
  return 26;
}
