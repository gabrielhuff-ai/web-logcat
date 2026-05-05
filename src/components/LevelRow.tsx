// Level pills + live rate + counts + pinned summary (40px tall).
//
// TODO(sonnet): single click toggles a level; double-click solos it
// (turns off all others). Disabled levels render with line-through.

import type { LevelEnabled, LogLevel } from '../types';

const LEVELS: LogLevel[] = ['V', 'D', 'I', 'W', 'E'];

export interface LevelRowProps {
  enabled: LevelEnabled;
  onToggle: (lvl: LogLevel) => void;
  onSolo: (lvl: LogLevel) => void;
  rate: number;
  filteredCount: number;
  totalCount: number;
  pinnedCount: number;
  onClearPinned: () => void;
  paused: boolean;
}

export function LevelRow({
  enabled,
  onToggle,
  onSolo,
  rate,
  filteredCount,
  totalCount,
  pinnedCount,
  onClearPinned,
  paused,
}: LevelRowProps) {
  return (
    <div className="lvl-bar">
      <div style={{ display: 'inline-flex', gap: 4, padding: '0 12px' }}>
        {LEVELS.map((l) => (
          <button
            key={l}
            className={`cell level lvl-${l}`}
            style={{ opacity: enabled[l] ? 1 : 0.35, textDecoration: enabled[l] ? 'none' : 'line-through' }}
            onClick={() => onToggle(l)}
            onDoubleClick={() => onSolo(l)}
            title={`${l} — click to toggle, double-click to solo`}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="lvl-spacer" />
      <div className="lvl-stats">
        <span className="rate-dot" data-pulse={!paused} />
        <span>{rate.toFixed(0)}/s</span>
        <span className="rate-sep">·</span>
        <span>
          {filteredCount}/{totalCount}
        </span>
      </div>
      {pinnedCount > 0 && (
        <div className="pin-summary">
          {pinnedCount} pinned
          <button className="pin-clear" onClick={onClearPinned}>
            clear
          </button>
        </div>
      )}
    </div>
  );
}
