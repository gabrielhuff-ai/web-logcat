// Chip filter input with autocomplete + transport + display toggles.
// Ported from design/source/filter-bar.jsx.
//
// Critical UX: focusing the empty input shows ALL 5 filter types as
// starters under "FILTER BY" — this is the only discoverability for the
// `process:` / `tag:` / `pid:` / `level:` / `message:` syntax.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import * as Icons from './Icons';
import { FILTER_TYPES, makeFilter } from '../lib/filters';
import type { Filter, FilterType } from '../types';

const PALETTE_SIZE = 6;

export interface FilterBarProps {
  filters: Filter[];
  setFilters: (next: Filter[]) => void;
  onlyMatches: boolean;
  setOnlyMatches: (v: boolean) => void;
  knownProcesses: string[];
  knownTags: string[];
  paused: boolean;
  setPaused: (v: boolean) => void;
  onClear: () => void;
  autoScroll: boolean;
  setAutoScroll: (v: boolean) => void;
  wrapLines: boolean;
  setWrapLines: (v: boolean) => void;
  /** Called when the user presses `/` outside an input — focuses the chip input. */
  registerFocusHandler?: (focus: () => void) => void;
}

interface Suggestion {
  kind: 'type' | 'value';
  label: string;
  insert: string;
  hint: string;
}

function typeHint(t: FilterType): string {
  switch (t) {
    case 'process':
      return 'package name';
    case 'tag':
      return 'log tag';
    case 'pid':
      return 'process / thread id';
    case 'level':
      return 'V D I W E';
    case 'message':
      return 'message text';
  }
}

export function FilterBar({
  filters,
  setFilters,
  onlyMatches,
  setOnlyMatches,
  knownProcesses,
  knownTags,
  paused,
  setPaused,
  onClear,
  autoScroll,
  setAutoScroll,
  wrapLines,
  setWrapLines,
  registerFocusHandler,
}: FilterBarProps) {
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const [acIdx, setAcIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    registerFocusHandler?.(() => inputRef.current?.focus());
  }, [registerFocusHandler]);

  const suggestions: Suggestion[] = useMemo(() => {
    const d = draft.trim();
    if (!d) {
      return FILTER_TYPES.map((t) => ({
        kind: 'type',
        label: `${t}:`,
        insert: `${t}:`,
        hint: typeHint(t),
      }));
    }
    const colon = d.indexOf(':');
    if (colon < 0) {
      const out: Suggestion[] = [];
      for (const t of FILTER_TYPES) {
        if (t.startsWith(d.toLowerCase())) {
          out.push({ kind: 'type', label: `${t}:`, insert: `${t}:`, hint: typeHint(t) });
        }
      }
      out.push({
        kind: 'value',
        label: `message contains "${d}"`,
        insert: d,
        hint: 'highlight',
      });
      return out;
    }
    const type = d.slice(0, colon).toLowerCase();
    const value = d.slice(colon + 1).trim();
    if (!(FILTER_TYPES as readonly string[]).includes(type)) return [];
    let pool: string[] = [];
    if (type === 'process') pool = knownProcesses;
    else if (type === 'tag') pool = knownTags;
    else if (type === 'level') pool = ['V', 'D', 'I', 'W', 'E'];
    else return [];
    const lc = value.toLowerCase();
    return pool
      .filter((p) => !lc || p.toLowerCase().includes(lc))
      .slice(0, 8)
      .map((p) => ({
        kind: 'value' as const,
        label: `${type}:${p}`,
        insert: `${type}:${p}`,
        hint: type,
      }));
  }, [draft, knownProcesses, knownTags]);

  useEffect(() => {
    setAcIdx(0);
  }, [draft]);

  const commit = (text?: string) => {
    const f = makeFilter(text ?? draft, PALETTE_SIZE);
    if (f) setFilters([...filters, f]);
    setDraft('');
  };
  const removeFilter = (id: number) => setFilters(filters.filter((f) => f.id !== id));

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (suggestions.length && focused) {
        const s = suggestions[acIdx];
        if (s.kind === 'type') {
          setDraft(s.insert);
          return;
        }
        commit(s.insert);
        return;
      }
      commit();
    } else if (e.key === 'Backspace' && !draft && filters.length) {
      removeFilter(filters[filters.length - 1].id);
    } else if (e.key === 'ArrowDown' && suggestions.length) {
      e.preventDefault();
      setAcIdx((acIdx + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp' && suggestions.length) {
      e.preventDefault();
      setAcIdx((acIdx - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Tab' && suggestions.length) {
      e.preventDefault();
      setDraft(suggestions[acIdx].insert);
    } else if (e.key === 'Escape') {
      setDraft('');
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div className="filter-bar">
      <div className="fb-transport">
        <button
          className={`icon-btn tt ${paused ? '' : 'active'}`}
          data-tt={paused ? 'Resume (Space)' : 'Pause (Space)'}
          onClick={() => setPaused(!paused)}
        >
          {paused ? <Icons.Play size={15} /> : <Icons.Pause size={14} />}
        </button>
        <button className="icon-btn tt" data-tt="Clear logs (⌘K)" onClick={onClear}>
          <Icons.Clear />
        </button>
        <button
          className={`icon-btn tt ${autoScroll ? 'active' : ''}`}
          data-tt={autoScroll ? 'Auto-scroll ON' : 'Scroll-locked'}
          onClick={() => setAutoScroll(!autoScroll)}
        >
          {autoScroll ? <Icons.Down /> : <Icons.Lock />}
        </button>
      </div>

      <div className="divider" />

      <div className="fb-chips" onClick={() => inputRef.current?.focus()}>
        {filters.map((f) => (
          <FilterChip key={f.id} f={f} onRemove={() => removeFilter(f.id)} />
        ))}
        <div className="fb-input-wrap">
          <input
            ref={inputRef}
            className="fb-input"
            value={draft}
            placeholder={
              filters.length
                ? ''
                : 'Filter — type to highlight, or use  process:  tag:  pid:  level:'
            }
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 120)}
            onKeyDown={onKey}
            spellCheck={false}
          />
          {focused && suggestions.length > 0 && (
            <div className="fb-ac">
              {!draft.trim() && (
                <div className="fb-ac-head">
                  Filter by — pick a type or just type to highlight
                </div>
              )}
              {suggestions.map((s, i) => (
                <button
                  key={s.label}
                  className={`fb-ac-item ${i === acIdx ? 'active' : ''}`}
                  onMouseEnter={() => setAcIdx(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (s.kind === 'type') setDraft(s.insert);
                    else commit(s.insert);
                  }}
                >
                  <span className="fb-ac-label">{s.label}</span>
                  <span className="fb-ac-hint">{s.hint}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <button
        className={`icon-btn tt ${onlyMatches ? 'active' : ''}`}
        data-tt={onlyMatches ? 'Showing only matches' : 'Show only matches'}
        onClick={() => setOnlyMatches(!onlyMatches)}
        disabled={filters.length === 0}
      >
        {onlyMatches ? <Icons.FilterFilled size={15} /> : <Icons.Filter size={15} />}
      </button>

      <div className="divider" />

      <div className="fb-display">
        <button
          className={`tb-mini tt ${wrapLines ? 'active' : ''}`}
          data-tt="Wrap long lines"
          onClick={() => setWrapLines(!wrapLines)}
        >
          <Icons.Wrap size={13} /> wrap
        </button>
      </div>
    </div>
  );
}

interface FilterChipProps {
  f: Filter;
  onRemove: () => void;
}

function FilterChip({ f, onRemove }: FilterChipProps) {
  const style = {
    '--c-fg': `oklch(var(--fc-l) var(--fc-c) var(--fc-${f.color}))`,
    '--c-bg': `oklch(var(--fc-bg-l) var(--fc-bg-c) var(--fc-${f.color}))`,
  } as CSSProperties;
  return (
    <span className="chip" style={style}>
      {f.type !== 'message' && <span className="chip-type">{f.type}:</span>}
      <span className="chip-val">{f.value}</span>
      <button
        className="chip-x"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        aria-label="Remove filter"
      >
        <Icons.Close size={9} />
      </button>
    </span>
  );
}
