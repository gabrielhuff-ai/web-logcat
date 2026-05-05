// Level filter pills + live rate + counts + pinned summary (40px tall).
// Ported from design/source/settings.jsx (LevelFilter) and the `lvl-bar`
// section of design/source/app.jsx.

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
}: LevelRowProps) {
  const solo = (l: LogLevel) => {
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
