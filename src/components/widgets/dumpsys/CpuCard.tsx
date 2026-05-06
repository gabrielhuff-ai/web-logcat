// CPU preset card grid.
//
// Cards: load averages, per-core usage bars, top processes by CPU%.

import type { CpuParsed } from '../../../lib/dumpsys/parsers/cpu';

export function CpuCard({ data }: { data: CpuParsed }) {
  const top = data.procs.slice(0, 8);
  const maxPct = Math.max(1, ...top.map((p) => p.pct));

  return (
    <>
      <div className="ds-card">
        <div className="ds-card-head">Load average</div>
        <div className="ds-loadgrid">
          {[
            { l: '1m', v: data.load?.one },
            { l: '5m', v: data.load?.five },
            { l: '15m', v: data.load?.fifteen },
          ].map((x) => (
            <div key={x.l} className="ds-loadcell">
              <div className="ds-loadval">
                {x.v != null ? x.v.toFixed(2) : '—'}
              </div>
              <div className="ds-loadlabel">{x.l}</div>
            </div>
          ))}
        </div>
      </div>

      {data.total && (
        <div className="ds-card">
          <div className="ds-card-head">
            CPU usage · {data.total.pct}% total
          </div>
          <div className="ds-card-row">
            <span className="k">User</span>
            <span className="v">{data.total.user}%</span>
          </div>
          <div className="ds-card-row">
            <span className="k">Kernel</span>
            <span className="v">{data.total.kernel}%</span>
          </div>
          <div className="ds-card-row">
            <span className="k">I/O wait</span>
            <span className="v">{data.total.iowait}%</span>
          </div>
          {data.total.softirq > 0 && (
            <div className="ds-card-row">
              <span className="k">Soft IRQ</span>
              <span className="v">{data.total.softirq}%</span>
            </div>
          )}
        </div>
      )}

      {data.cores.length > 0 && (
        <div className="ds-card">
          <div className="ds-card-head">Per-core usage</div>
          <div className="ds-cores">
            {data.cores.map((c) => {
              const used = 100 - c.idle;
              const colorVar =
                used > 80
                  ? 'var(--lvl-w-fg)'
                  : used > 50
                    ? 'oklch(0.72 0.13 80)'
                    : 'oklch(0.74 0.13 220)';
              return (
                <div key={c.id} className="ds-core">
                  <div className="ds-core-label">CPU {c.id}</div>
                  <div className="ds-core-bar">
                    <div
                      className="ds-core-fill"
                      style={{ width: `${used}%`, background: colorVar }}
                    />
                  </div>
                  <div className="ds-core-pct">{used}%</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="ds-card">
        <div className="ds-card-head">Top processes by CPU%</div>
        <div className="ds-procs">
          {top.length === 0 && <div className="ds-empty">No process data.</div>}
          {top.map((p) => (
            <div key={`${p.pkg}-${p.pid}`} className="ds-proc">
              <div className="ds-proc-row">
                <span className="ds-proc-name">
                  {p.pkg} <span className="ds-proc-pid">({p.pid})</span>
                </span>
                <span className="ds-proc-val">{p.pct}%</span>
              </div>
              <div className="ds-proc-bar">
                <div
                  className="ds-proc-fill"
                  style={{
                    width: `${(p.pct / maxPct) * 100}%`,
                    background: 'oklch(0.74 0.13 220)',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
