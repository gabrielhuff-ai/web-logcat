// Memory preset card grid.
//
// Cards: RAM total / used / free + bar; top processes by PSS; the
// focused App Summary (Java vs Native split as a stack bar).

import type { MemoryParsed } from '../../../lib/dumpsys/parsers/memory';

export function MemoryCard({ data }: { data: MemoryParsed }) {
  const totalGB = (data.totalRamKb ?? 0) / 1024 / 1024;
  const usedGB = (data.usedRamKb ?? 0) / 1024 / 1024;
  const freeGB = (data.freeRamKb ?? 0) / 1024 / 1024;
  const top = data.procs.slice(0, 8);
  const max = Math.max(1, ...top.map((p) => p.kb));

  const javaKb = data.javaHeapKb ?? 0;
  const nativeKb = data.nativeHeapKb ?? 0;
  const codeKb = data.codeKb ?? 0;
  const stackKb = data.stackKb ?? 0;
  const sumKb = javaKb + nativeKb + codeKb + stackKb;

  return (
    <>
      <div className="ds-card">
        <div className="ds-card-head">RAM</div>
        <div className="ds-card-row">
          <span className="k">Total</span>
          <span className="v">{totalGB.toFixed(1)} GB</span>
        </div>
        <div className="ds-card-row">
          <span className="k">Used</span>
          <span className="v">{usedGB.toFixed(1)} GB</span>
        </div>
        <div className="ds-card-row">
          <span className="k">Free</span>
          <span className="v">{freeGB.toFixed(1)} GB</span>
        </div>
        {totalGB > 0 && (
          <div className="ds-stackbar">
            <div
              className="ds-stackbar-seg"
              style={{
                width: `${(usedGB / totalGB) * 100}%`,
                background: 'oklch(0.74 0.13 220)',
              }}
            />
            <div
              className="ds-stackbar-seg"
              style={{
                width: `${(freeGB / totalGB) * 100}%`,
                background: 'oklch(0.74 0.16 150)',
                opacity: 0.5,
              }}
            />
          </div>
        )}
      </div>

      {data.pkg && sumKb > 0 && (
        <div className="ds-card">
          <div className="ds-card-head">
            App Summary · {data.pkg}
            {data.pid != null ? ` (pid ${data.pid})` : ''}
          </div>
          <div className="ds-card-row">
            <span className="k">Java heap</span>
            <span className="v">{(javaKb / 1024).toFixed(1)} MB</span>
          </div>
          <div className="ds-card-row">
            <span className="k">Native heap</span>
            <span className="v">{(nativeKb / 1024).toFixed(1)} MB</span>
          </div>
          <div className="ds-card-row">
            <span className="k">Code</span>
            <span className="v">{(codeKb / 1024).toFixed(1)} MB</span>
          </div>
          <div className="ds-card-row">
            <span className="k">Stack</span>
            <span className="v">{(stackKb / 1024).toFixed(1)} MB</span>
          </div>
          <div className="ds-stackbar" aria-label="Java vs Native heap split">
            <div
              className="ds-stackbar-seg"
              style={{
                width: `${(javaKb / sumKb) * 100}%`,
                background: 'oklch(0.74 0.13 220)',
              }}
              title={`Java ${(javaKb / 1024).toFixed(1)} MB`}
            />
            <div
              className="ds-stackbar-seg"
              style={{
                width: `${(nativeKb / sumKb) * 100}%`,
                background: 'oklch(0.7 0.16 60)',
              }}
              title={`Native ${(nativeKb / 1024).toFixed(1)} MB`}
            />
            <div
              className="ds-stackbar-seg"
              style={{
                width: `${(codeKb / sumKb) * 100}%`,
                background: 'oklch(0.65 0.05 270)',
              }}
              title={`Code ${(codeKb / 1024).toFixed(1)} MB`}
            />
            <div
              className="ds-stackbar-seg"
              style={{
                width: `${(stackKb / sumKb) * 100}%`,
                background: 'oklch(0.55 0.04 270)',
              }}
              title={`Stack ${(stackKb / 1024).toFixed(1)} MB`}
            />
          </div>
        </div>
      )}

      <div className="ds-card">
        <div className="ds-card-head">Top processes by PSS</div>
        <div className="ds-procs">
          {top.length === 0 && <div className="ds-empty">No process data.</div>}
          {top.map((p) => (
            <div key={p.pkg + (p.pid ?? '')} className="ds-proc">
              <div className="ds-proc-row">
                <span className="ds-proc-name">{p.pkg}</span>
                <span className="ds-proc-val">
                  {(p.kb / 1024).toFixed(1)} MB
                </span>
              </div>
              <div className="ds-proc-bar">
                <div
                  className="ds-proc-fill"
                  style={{ width: `${(p.kb / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
