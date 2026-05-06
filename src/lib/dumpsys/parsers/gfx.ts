// Parser for `dumpsys gfxinfo` output.
//
// Captures the per-process Graphics block (which app, total frames, jank
// %, percentile latencies, stall counters) and the frame-time histogram.

export interface GfxHistogramBucket {
  /** Frame-time bucket in milliseconds. */
  ms: number;
  /** Number of frames in the bucket. */
  count: number;
}

export interface GfxParsed {
  /** Package the Graphics info block applies to (when present). */
  pkg: string | null;
  pid: number | null;
  totalFrames: number | null;
  jankyFrames: number | null;
  jankyPct: number | null;
  /** 50/90/95/99-th percentile frame-times in milliseconds. */
  p50: number | null;
  p90: number | null;
  p95: number | null;
  p99: number | null;
  /** Stall counters. */
  missedVsync: number | null;
  highInputLatency: number | null;
  slowUiThread: number | null;
  slowBitmapUploads: number | null;
  slowDrawCommands: number | null;
  frameDeadlineMissed: number | null;
  /** Frame-time histogram, sorted ascending by `ms`. Empty if absent. */
  histogram: GfxHistogramBucket[];
}

/**
 * Parse `dumpsys gfxinfo` output. Lenient — every field is independently
 * nullable, the histogram is a separate optional section.
 */
export function parseGfxinfo(raw: string): GfxParsed {
  const head =
    /\*\*\s+Graphics info for pid\s+(\d+)\s+\[([^\]]+)\]\s+\*\*/.exec(raw);
  const pid = head ? Number(head[1]) : null;
  const pkg = head ? head[2] : null;

  const intField = (key: string): number | null => {
    const re = new RegExp(`${escape(key)}:\\s*([\\d,]+)`, 'i');
    const m = re.exec(raw);
    if (!m) return null;
    const n = Number(m[1].replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  };

  const msField = (key: string): number | null => {
    const re = new RegExp(`${escape(key)}:\\s*([\\d,]+)\\s*ms`, 'i');
    const m = re.exec(raw);
    if (!m) return null;
    const n = Number(m[1].replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  };

  // "Janky frames: 380 (2.06%)"
  const jankyMatch = /Janky frames:\s*([\d,]+)\s*\(([\d.]+)%\)/.exec(raw);
  const jankyFrames = jankyMatch
    ? Number(jankyMatch[1].replace(/,/g, ''))
    : null;
  const jankyPct = jankyMatch ? Number(jankyMatch[2]) : null;

  // Histogram line: "HISTOGRAM: 5ms=120 6ms=820 ..." (single line)
  const histLine = /^HISTOGRAM:\s*(.+)$/m.exec(raw);
  const histogram: GfxHistogramBucket[] = [];
  if (histLine) {
    const buckets = histLine[1].matchAll(/(\d+)ms=(\d+)/g);
    for (const b of buckets) {
      histogram.push({ ms: Number(b[1]), count: Number(b[2]) });
    }
    histogram.sort((a, b) => a.ms - b.ms);
  }

  return {
    pkg,
    pid,
    totalFrames: intField('Total frames rendered'),
    jankyFrames,
    jankyPct,
    p50: msField('50th percentile'),
    p90: msField('90th percentile'),
    p95: msField('95th percentile'),
    p99: msField('99th percentile'),
    missedVsync: intField('Number Missed Vsync'),
    highInputLatency: intField('Number High input latency'),
    slowUiThread: intField('Number Slow UI thread'),
    slowBitmapUploads: intField('Number Slow bitmap uploads'),
    slowDrawCommands: intField('Number Slow issue draw commands'),
    frameDeadlineMissed: intField('Number Frame deadline missed'),
    histogram,
  };
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
