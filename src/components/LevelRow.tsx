// Level filter pills + live rate + counts + pinned summary (40px tall).
// Ported from design/v1/source/settings.jsx (LevelFilter) and the `lvl-bar`
// section of design/v1/source/app.jsx.

import * as Icons from './Icons';
import type { LevelEnabled, LogLevel } from '../types';

const LEVELS: ReadonlyArray<{ l: LogLevel; label: string }> = [
  { l: 'V', label: 'Verbose' },
  { l: 'D', label: 'Debug' },
  { l: 'I', label: 'Info' },
  { l: 'W', label: 'Warn' },
  { l: 'E', label: 'Error' },
];

export interface LevelRowProps {
  enabled: LevelEnabled;
  setEnabled: (next: LevelEnabled) => void;
  rate: number;
  filteredCount: number;
  totalCount: number;
  pinnedCount: number;
  onClearPinned: () => void;
  paused: boolean;
  showTimestamps: boolean;
  setShowTimestamps: (v: boolean) => void;
  showPid: boolean;
  setShowPid: (v: boolean) => void;
  showProcess: boolean;
  setShowProcess: (v: boolean) => void;
  showTag: boolean;
  setShowTag: (v: boolean) => void;
  showLevel: boolean;
  setShowLevel: (v: boolean) => void;
}

export function LevelRow({
  enabled,
  setEnabled,
  rate,
  filteredCount,
  totalCount,
  pinnedCount,
  onClearPinned,
  paused,
  showTimestamps,
  setShowTimestamps,
  showPid,
  setShowPid,
  showProcess,
  setShowProcess,
  showTag,
  setShowTag,
  showLevel,
  setShowLevel,
}: LevelRowProps) {
  const solo = (l: LogLevel) => {
    // Re-soloing the already-solo level enables all levels — turns the
    // double-click into a one-gesture toggle between solo and "all on"
    // so users don't have to click the other four chips back on by hand.
    const onCount = LEVELS.reduce((n, { l: x }) => n + (enabled[x] ? 1 : 0), 0);
    if (onCount === 1 && enabled[l]) {
      setEnabled({ V: true, D: true, I: true, W: true, E: true });
      return;
    }
    const next: LevelEnabled = { V: false, D: false, I: false, W: false, E: false };
    next[l] = true;
    setEnabled(next);
  };
  return (
    <div className="lvl-bar">
      <div className="lvl-filter">
        {LEVELS.map(({ l, label }) => (
          <button
            key={l}
            className={`lvl-pill lvl-${l} ${enabled[l] ? 'on' : 'off'}`}
            onClick={() => setEnabled({ ...enabled, [l]: !enabled[l] })}
            onDoubleClick={() => solo(l)}
            title={`${label} — double-click to solo`}
          >
            <span className="lvl-letter">{l}</span>
            <span className="lvl-name">{label}</span>
          </button>
        ))}
      </div>
      <div className="divider" />
      <div className="lvl-toggles">
        <button
          className={`tb-mini tt ${showTimestamps ? 'active' : ''}`}
          data-tt="Timestamps"
          onClick={() => setShowTimestamps(!showTimestamps)}
        >
          <Icons.Time size={13} /> ts
        </button>
        <button
          className={`tb-mini tt ${showPid ? 'active' : ''}`}
          data-tt="PID / TID"
          onClick={() => setShowPid(!showPid)}
        >
          <Icons.Hash size={13} /> pid
        </button>
        <button
          className={`tb-mini tt ${showProcess ? 'active' : ''}`}
          data-tt="Process"
          onClick={() => setShowProcess(!showProcess)}
        >
          <Icons.Device size={13} /> proc
        </button>
        <button
          className={`tb-mini tt ${showTag ? 'active' : ''}`}
          data-tt="Tag"
          onClick={() => setShowTag(!showTag)}
        >
          <Icons.Stack size={13} /> tag
        </button>
        <button
          className={`tb-mini tt ${showLevel ? 'active' : ''}`}
          data-tt="Verbosity column"
          onClick={() => setShowLevel(!showLevel)}
        >
          <Icons.Highlight size={13} /> lvl
        </button>
      </div>
      <div className="lvl-spacer" />
      <span className="lvl-stats">
        <span className="rate-dot" data-pulse={!paused && rate > 0} />
        <span>{rate}/s</span>
        <span className="rate-sep">·</span>
        <span>
          {filteredCount.toLocaleString()} of {totalCount.toLocaleString()}
        </span>
      </span>
      {pinnedCount > 0 && (
        <div className="pin-summary">
          <Icons.PinFilled size={11} /> {pinnedCount} pinned
          <button className="pin-clear" onClick={onClearPinned}>
            clear
          </button>
        </div>
      )}
    </div>
  );
}
