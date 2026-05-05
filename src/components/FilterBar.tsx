// Filter chip input + transport controls + display toggles.
//
// TODO(sonnet): port from design/source/filter-bar.jsx. Critical bits:
//   - Autocomplete dropdown that on focus-with-empty-draft shows ALL 5
//     filter types as discoverability scaffolding ("FILTER BY — pick a
//     type or just type to highlight").
//   - Tab autocomplete; Enter commits; Backspace removes last chip.
//   - Wire `Filters.makeFilter` / `entryMatches` from src/lib/filters.ts.

import type { Filter } from '../types';

export interface FilterBarProps {
  filters: Filter[];
  onAddFilter: (raw: string) => void;
  onRemoveFilter: (id: number) => void;
  paused: boolean;
  onTogglePause: () => void;
  onClear: () => void;
  autoScroll: boolean;
  onToggleAutoScroll: () => void;
  onlyMatches: boolean;
  onToggleOnlyMatches: () => void;
}

export function FilterBar(props: FilterBarProps) {
  return (
    <div className="filter-bar">
      <div className="tb-transport">
        <button className="icon-btn" onClick={props.onTogglePause} title="Pause / resume (Space)">
          {props.paused ? '▶' : '❚❚'}
        </button>
        <button className="icon-btn" onClick={props.onClear} title="Clear (⌘K)">
          ⌫
        </button>
        <button
          className={`icon-btn ${props.autoScroll ? 'active' : ''}`}
          onClick={props.onToggleAutoScroll}
          title="Auto-scroll"
        >
          ⇣
        </button>
      </div>
      <span className="divider" />
      <div className="filter-chips" />
      <div className="filter-spacer" style={{ flex: 1 }} />
      <button
        className={`icon-btn ${props.onlyMatches ? 'active' : ''}`}
        onClick={props.onToggleOnlyMatches}
        disabled={props.filters.length === 0}
        title="Show only matching rows"
      >
        ⛛
      </button>
    </div>
  );
}
