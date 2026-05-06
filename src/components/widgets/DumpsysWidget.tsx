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
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAdb } from '../../lib/adbContext';
import { useDashboardChrome } from '../../lib/dashboardChrome';
import {
  DUMPSYS_PRESETS,
  DumpsysUnsupportedError,
  runDumpsys,
  type DumpsysPresetId,
  type DumpsysResult,
} from '../../lib/dumpsys';
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

type View = 'cards' | 'raw';

/** Min spinner display so even a fast result reads as a "run", not a flash. */
const MIN_SPIN_MS = 220;

export function DumpsysWidget({ tileId }: DumpsysWidgetProps) {
  const { device, adb, usingFake } = useAdb();
  const { showToast } = useDashboardChrome();

  // Selected preset id — persisted per (serial, tile).
  const presetKey = useMemo(
    () => (device ? `weblogcat:dumpsys:${device.serial}:${tileId}:preset` : null),
    [device, tileId],
  );
  const [selected, setSelected] = useState<DumpsysPresetId>(() => {
    if (typeof window === 'undefined') return 'battery';
    const fallback: DumpsysPresetId = 'battery';
    if (!presetKey) return fallback;
    try {
      const raw = localStorage.getItem(presetKey);
      if (raw && DUMPSYS_PRESETS.some((p) => p.id === raw)) {
        return raw as DumpsysPresetId;
      }
    } catch {
      /* ignore */
    }
    return fallback;
  });

  const [result, setResult] = useState<DumpsysResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('cards');
  const runIdRef = useRef(0);

  // Persist preset selection.
  useEffect(() => {
    if (!presetKey) return;
    try {
      localStorage.setItem(presetKey, selected);
    } catch {
      /* ignore */
    }
  }, [presetKey, selected]);

  const run = useCallback(
    async (id: DumpsysPresetId) => {
      const myRun = ++runIdRef.current;
      setRunning(true);
      setError(null);
      const startedAt = Date.now();

      try {
        let res: DumpsysResult;
        if (usingFake || !adb) {
          res = runDumpsysSim(id);
        } else {
          res = await runDumpsys(adb, id);
        }
        // Honour the minimum spinner duration so the "running…" UI
        // doesn't strobe on instant results from the simulator.
        const elapsed = Date.now() - startedAt;
        if (elapsed < MIN_SPIN_MS) {
          await new Promise((r) => setTimeout(r, MIN_SPIN_MS - elapsed));
        }
        if (runIdRef.current !== myRun) return; // a newer run superseded this one
        setResult(res);
        setRunning(false);
      } catch (err) {
        if (runIdRef.current !== myRun) return;
        setRunning(false);
        if (err instanceof DumpsysUnsupportedError) {
          setError('This device does not support shell-protocol v2 (dumpsys requires it).');
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        showToast(`dumpsys ${id} failed: ${msg}`);
      }
    },
    [adb, usingFake, showToast],
  );

  // Run on mount + whenever `selected` changes.
  useEffect(() => {
    void run(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, usingFake, adb]);

  const onPresetClick = useCallback((id: DumpsysPresetId) => {
    setSelected(id);
  }, []);

  const onRefresh = useCallback(() => {
    void run(selected);
  }, [run, selected]);

  const onCopy = useCallback(() => {
    if (!result) return;
    void navigator.clipboard
      .writeText(result.raw)
      .then(() => showToast('Raw output copied'))
      .catch(() => showToast('Copy failed'));
  }, [result, showToast]);

  return (
    <div className="ds-widget">
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
          className="ds-icon-btn"
          onClick={onRefresh}
          title="Run again"
          disabled={running}
        >
          <Icons.Refresh size={13} />
        </button>
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
