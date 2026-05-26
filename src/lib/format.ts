// Small formatting + layout helpers shared across the UI.

import type { Tweaks } from '../types';

/** Logcat row timestamp presentation. `datetime` is the full Android
 *  logcat shape (`MM-DD HH:MM:SS.mmm`); the shorter forms drop the date
 *  and then the milliseconds so narrow tiles can reclaim the column. */
export type TimestampFormat = 'datetime' | 'time' | 'clock';

export function formatTs(ts: number, format: TimestampFormat = 'datetime'): string {
  const d = new Date(ts);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  if (format === 'clock') return clock;
  const withMs = `${clock}.${pad(d.getMilliseconds(), 3)}`;
  if (format === 'time') return withMs;
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${withMs}`;
}

/** Estimated pixel height of one log row at the given density. Used by
 *  the virtualiser as `estimateSize` and by `App.tsx` to compute the
 *  trim-anchor compensation. */
export function rowHeightFor(density: Tweaks['density']): number {
  if (density === 'compact') return 22;
  if (density === 'comfortable') return 32;
  return 26;
}
