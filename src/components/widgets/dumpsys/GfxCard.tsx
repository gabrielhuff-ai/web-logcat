// GFX preset card grid.
//
// Cards: per-app frame summary, percentile latencies, frame-time
// histogram (jank / 16ms / 30ms+), HWUI stall counters.

import type { GfxParsed } from '../../../lib/dumpsys/parsers/gfx';

const TARGET_MS = 16; // 60fps deadline.

export function GfxCard({ data }: { data: GfxParsed }) {
  const pcts = [
    { l: 'p50', v: data.p50 },
    { l: 'p90', v: data.p90 },
    { l: 'p95', v: data.p95 },
    { l: 'p99', v: data.p99 },
  ];

  // Bucket the histogram into three groups for the simple bar:
  //  - <=16ms (good), 17–32ms (slow), >32ms (very slow / dropped).
  let good = 0;
  let slow = 0;
  let bad = 0;
  for (const b of data.histogram) {
    if (b.ms <= TARGET_MS) good += b.count;
    else if (b.ms <= 32) slow += b.count;
    else bad += b.count;
  }
  const totalBucketed = good + slow + bad;

  // Histogram chart: scale bar heights against the tallest bucket.
  const maxCount = Math.max(1, ...data.histogram.map((b) => b.count));

  return (
    <>
      <div className="ds-card">
        <div className="ds-card-head">
          Frame rendering{data.pkg ? ` · ${data.pkg}` : ''}
        </div>
        <div className="ds-card-row">
          <span className="k">Total frames</span>
          <span className="v">{data.totalFrames?.toLocaleString() ?? '—'}</span>
        </div>
        <div className="ds-card-row">
          <span className="k">Janky frames</span>
          <span
            className={
              'v' + (data.jankyPct != null && data.jankyPct > 5 ? ' warn' : '')
            }
          >
            {data.jankyFrames?.toLocaleString() ?? '—'}
            {data.jankyPct != null ? ` (${data.jankyPct.toFixed(2)}%)` : ''}
          </span>
        </div>
      </div>

      <div className="ds-card">
        <div className="ds-card-head">Frame time percentiles</div>
        <div className="ds-pcts">
          {pcts.map((x) => (
            <div key={x.l} className="ds-pct">
              <div
                className={
                  'ds-pct-val' +
                  (x.v != null && x.v > TARGET_MS ? ' warn' : '')
                }
              >
                {x.v != null ? x.v : '—'}
                <span>ms</span>
              </div>
              <div className="ds-pct-label">{x.l}</div>
            </div>
          ))}
        </div>
        <div className="ds-pct-target">target: {TARGET_MS}ms (60fps)</div>
      </div>

      {totalBucketed > 0 && (
        <div className="ds-card">
          <div className="ds-card-head">Frame-time distribution</div>
          <div className="ds-bucket-row">
            <span className="k">≤ 16ms</span>
            <span className="v">
              {good.toLocaleString()} ({Math.round((good / totalBucketed) * 100)}
              %)
            </span>
          </div>
          <div className="ds-bucket-row">
            <span className="k">17–32ms</span>
            <span className="v">
              {slow.toLocaleString()} ({Math.round((slow / totalBucketed) * 100)}
              %)
            </span>
          </div>
          <div className="ds-bucket-row">
            <span className="k">&gt; 32ms</span>
            <span className="v">
              {bad.toLocaleString()} ({Math.round((bad / totalBucketed) * 100)}%)
            </span>
          </div>
          <div className="ds-stackbar" aria-label="Frame time distribution">
            <div
              className="ds-stackbar-seg"
              style={{
                width: `${(good / totalBucketed) * 100}%`,
                background: 'oklch(0.74 0.16 150)',
              }}
            />
            <div
              className="ds-stackbar-seg"
              style={{
                width: `${(slow / totalBucketed) * 100}%`,
                background: 'oklch(0.72 0.13 80)',
              }}
            />
            <div
              className="ds-stackbar-seg"
              style={{
                width: `${(bad / totalBucketed) * 100}%`,
                background: 'var(--lvl-e-fg)',
              }}
            />
          </div>
          <div
            className="ds-histogram"
            aria-label="Frame-time histogram by millisecond"
          >
            {data.histogram.map((b) => (
              <div key={b.ms} className="ds-histogram-col" title={`${b.ms}ms · ${b.count} frames`}>
                <div
                  className="ds-histogram-bar"
                  style={{
                    height: `${(b.count / maxCount) * 100}%`,
                    background:
                      b.ms <= TARGET_MS
                        ? 'oklch(0.74 0.16 150)'
                        : b.ms <= 32
                          ? 'oklch(0.72 0.13 80)'
                          : 'var(--lvl-e-fg)',
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="ds-card">
        <div className="ds-card-head">HWUI stalls</div>
        <Row k="Missed Vsync" v={data.missedVsync} />
        <Row k="Slow UI thread" v={data.slowUiThread} />
        <Row k="High input latency" v={data.highInputLatency} />
        <Row k="Slow bitmap uploads" v={data.slowBitmapUploads} />
        <Row k="Slow draw commands" v={data.slowDrawCommands} />
        <Row k="Frame deadline missed" v={data.frameDeadlineMissed} />
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: number | null }) {
  return (
    <div className="ds-card-row">
      <span className="k">{k}</span>
      <span className="v">{v != null ? v.toLocaleString() : '—'}</span>
    </div>
  );
}
