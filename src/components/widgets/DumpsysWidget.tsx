// Dumpsys widget — preset selector + parsed cards / raw output toggle.
//
// Per HANDOFF §Dumpsys Widget: five preset buttons (Battery / Memory /
// CPU / GFX / Wi-Fi), a Run / Refresh control, a Copy-raw button, and
// a parsed↔raw view toggle. The body switches between a parsed card
// grid and a raw monospace dump.
//
// Two backends, switched on `useAdb().usingFake` (matches Shell's
// pattern):
//   - Real device → `runDumpsys(adb, id)` shells out via shell-protocol
//     v2 and parses. Devices without shell-v2 surface an inline notice.
//   - Simulator   → `runDumpsysSim(id)` returns the captured fixture.
//
// Per-tile state persisted: the selected preset id (so reload puts the
// user back on the same preset they were inspecting). The cached raw
// output is intentionally not persisted — re-running on remount gives
// fresher data.

import '../../styles/widgets/dumpsys.css';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useAdb } from '../../lib/adbContext';
import { useDashboardChrome } from '../../lib/dashboardChrome';
import { useTileSettings } from '../../lib/tileSettings';
import {
  DUMPSYS_PRESETS,
  DumpsysUnsupportedError,
  runDumpsys,
  type DumpsysPresetId,
  type DumpsysResult,
} from '../../lib/dumpsys';
import {
  AUTO_REFRESH_OPTIONS,
  DUMPSYS_DEFAULTS,
  type DumpsysSettings,
  type DumpsysView,
} from './dumpsys/dumpsysSettings';
import { runDumpsysSim } from '../../lib/dumpsys/sim';
import * as Icons from '../Icons';
import { BatteryCard } from './dumpsys/BatteryCard';
import { MemoryCard } from './dumpsys/MemoryCard';
import { CpuCard } from './dumpsys/CpuCard';
import { GfxCard } from './dumpsys/GfxCard';
import { WifiCard } from './dumpsys/WifiCard';

export interface DumpsysWidgetProps {
  /** Stable id of the host tile — used to namespace per-instance state. */
  tileId: string;
}

/** Min spinner display so even a fast result reads as a "run", not a flash. */
const MIN_SPIN_MS = 220;

export function DumpsysWidget({ tileId }: DumpsysWidgetProps) {
  const { adb, usingFake } = useAdb();
  const { showToast } = useDashboardChrome();
  const [settings, setSettings] = useTileSettings<DumpsysSettings>(
    tileId,
    'dumpsys',
    DUMPSYS_DEFAULTS,
  );

  // Selected preset and view both flow through the per-tile settings —
  // changes from the bar OR the modal write the same key.
  const selected = settings.defaultPreset;
  const setSelected = useCallback(
    (id: DumpsysPresetId) => setSettings({ defaultPreset: id }),
    [setSettings],
  );
  const view = settings.defaultView;
  const setView = useCallback(
    (v: DumpsysView) => setSettings({ defaultView: v }),
    [setSettings],
  );

  const [result, setResult] = useState<DumpsysResult | null>(null);
  const [running, setRunning] = useState(false);
  // Set true while a *silent* (auto / manual-while-result-shown) refresh
  // is in flight. Distinct from `running` so the body keeps showing the
  // previous result instead of falling back to the spinner. Drives the
  // `.ds-refresh-pulse` indicator in the toolbar.
  const [silentRefreshing, setSilentRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runIdRef = useRef(0);

  const run = useCallback(
    async (id: DumpsysPresetId, opts: { silent?: boolean } = {}) => {
      const myRun = ++runIdRef.current;
      const silent = opts.silent === true;
      if (silent) setSilentRefreshing(true);
      else {
        setRunning(true);
        setError(null);
      }
      const startedAt = Date.now();

      try {
        let res: DumpsysResult;
        if (usingFake || !adb) {
          res = runDumpsysSim(id);
        } else {
          res = await runDumpsys(adb, id);
        }
        // Honour the minimum spinner duration on visible runs so the
        // "running…" UI doesn't strobe on instant fixture results. We
        // skip this for silent refreshes — there's no spinner to keep
        // company, and a 200ms artificial wait would just delay fresh
        // data needlessly.
        if (!silent) {
          const elapsed = Date.now() - startedAt;
          if (elapsed < MIN_SPIN_MS) {
            await new Promise((r) => setTimeout(r, MIN_SPIN_MS - elapsed));
          }
        }
        if (runIdRef.current !== myRun) return; // a newer run superseded this one
        setResult(res);
        if (silent) setSilentRefreshing(false);
        else setRunning(false);
        setError(null);
      } catch (err) {
        if (runIdRef.current !== myRun) return;
        if (silent) setSilentRefreshing(false);
        else setRunning(false);
        if (err instanceof DumpsysUnsupportedError) {
          setError('This device does not support shell-protocol v2 (dumpsys requires it).');
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        // Don't toast on silent refresh failures — the user might not
        // be looking, and a recurring failure (e.g. device disconnect)
        // would spam the toast surface.
        if (!silent) showToast(`dumpsys ${id} failed: ${msg}`);
      }
    },
    [adb, usingFake, showToast],
  );

  // Run on mount + whenever `selected` changes.
  useEffect(() => {
    void run(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, usingFake, adb]);

  // Auto-refresh interval. Resets whenever the user picks a new preset
  // (we want a fresh window starting from the moment they switched) or
  // changes the interval itself.
  useEffect(() => {
    const ms = settings.autoRefreshMs;
    if (!ms || ms <= 0) return;
    const t = window.setInterval(() => {
      // Skip the tick if a foreground run is already in flight to avoid
      // queueing requests behind the simulator's `MIN_SPIN_MS` wait or
      // a slow device.
      if (runIdRef.current > 0 && (running || silentRefreshing)) return;
      void run(selected, { silent: true });
    }, ms);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.autoRefreshMs, selected, usingFake, adb]);

  const onPresetClick = useCallback(
    (id: DumpsysPresetId) => {
      setSelected(id);
    },
    [setSelected],
  );

  const onRefresh = useCallback(() => {
    // Manual refresh after the first result also goes silent so the
    // user doesn't lose context to a spinner. The first run (no
    // result yet) still shows the spinner.
    void run(selected, { silent: result != null });
  }, [run, selected, result]);

  const setAutoRefreshMs = useCallback(
    (ms: number) => setSettings({ autoRefreshMs: ms }),
    [setSettings],
  );

  const onCopy = useCallback(() => {
    if (!result) return;
    void navigator.clipboard
      .writeText(result.raw)
      .then(() => showToast('Raw output copied'))
      .catch(() => showToast('Copy failed'));
  }, [result, showToast]);

  const widgetStyle: CSSProperties = {
    ['--widget-font-size' as string]: `${settings.fontSize}px`,
  } as CSSProperties;

  return (
    <div className="ds-widget" style={widgetStyle}>
      <div className="ds-toolbar widget-bar">
        <div className="ds-presets">
          {DUMPSYS_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={'ds-pill' + (selected === p.id ? ' on' : '')}
              onClick={() => onPresetClick(p.id)}
              title={p.desc}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={
            'ds-icon-btn' + (silentRefreshing ? ' ds-refresh-pulse' : '')
          }
          onClick={onRefresh}
          title={
            settings.autoRefreshMs > 0
              ? `Run again (auto every ${msToLabel(settings.autoRefreshMs)})`
              : 'Run again'
          }
          disabled={running}
        >
          <Icons.Refresh size={13} />
        </button>
        <select
          className="ds-auto-refresh"
          value={settings.autoRefreshMs}
          onChange={(e) => setAutoRefreshMs(Number(e.target.value))}
          title="Auto-refresh interval"
          aria-label="Auto-refresh interval"
        >
          {AUTO_REFRESH_OPTIONS.map((opt) => (
            <option key={opt.ms} value={opt.ms}>
              {opt.ms === 0 ? 'Auto: off' : `Auto: ${opt.label}`}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="ds-icon-btn"
          onClick={onCopy}
          title="Copy raw output"
          disabled={!result}
        >
          <CopyIcon size={13} />
        </button>
        <span style={{ flex: 1 }} />
        <div className="ds-view-seg" role="tablist" aria-label="View mode">
          <button
            role="tab"
            aria-selected={view === 'cards'}
            className={view === 'cards' ? 'on' : ''}
            onClick={() => setView('cards')}
          >
            Parsed
          </button>
          <button
            role="tab"
            aria-selected={view === 'raw'}
            className={view === 'raw' ? 'on' : ''}
            onClick={() => setView('raw')}
          >
            Raw
          </button>
        </div>
      </div>

      <div className="ds-body">
        {running ? (
          <div className="ds-status">
            <div className="ds-spinner" />
            <span>
              Running <code>dumpsys {labelFor(selected)}</code>…
            </span>
          </div>
        ) : error ? (
          <div className="ds-status ds-status-err">
            <span>{error}</span>
          </div>
        ) : !result ? (
          <div className="ds-status">No output.</div>
        ) : view === 'raw' ? (
          <pre className="ds-raw">{result.raw}</pre>
        ) : (
          <div className="ds-cards">{renderCards(result)}</div>
        )}
      </div>
    </div>
  );
}

/**
 * Inline copy-to-clipboard glyph. Defined here rather than in
 * `Icons.tsx` so this PR doesn't touch a file other widget phases also
 * extend (avoiding a merge-time collision).
 */
function CopyIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="9" y="3" width="11" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M15 17v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function labelFor(id: DumpsysPresetId): string {
  const p = DUMPSYS_PRESETS.find((x) => x.id === id);
  if (!p) return id;
  return p.args.join(' ');
}

function msToLabel(ms: number): string {
  const opt = AUTO_REFRESH_OPTIONS.find((o) => o.ms === ms);
  return opt?.label ?? `${ms}ms`;
}

function renderCards(result: DumpsysResult): ReactNode {
  const { parsed } = result;
  switch (parsed.id) {
    case 'battery':
      return <BatteryCard data={parsed.data} />;
    case 'meminfo':
      return <MemoryCard data={parsed.data} />;
    case 'cpuinfo':
      return <CpuCard data={parsed.data} />;
    case 'gfxinfo':
      return <GfxCard data={parsed.data} />;
    case 'wifi':
      return <WifiCard data={parsed.data} />;
  }
}
