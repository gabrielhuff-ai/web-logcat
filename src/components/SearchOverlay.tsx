// Floating search box (⌘F / Ctrl+F). Top-right; esc dismisses.
// The match count + highlighting is wired in App.tsx via `search` state
// flowing through filters to LogRow.

import { useEffect, useRef } from 'react';
import * as Icons from './Icons';

export interface SearchOverlayProps {
  open: boolean;
  query: string;
  matchCount: number;
  onChange: (q: string) => void;
  onClose: () => void;
}

export function SearchOverlay({ open, query, matchCount, onChange, onClose }: SearchOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;
  return (
    <div className="search-overlay" role="search">
      <Icons.Search size={13} />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
        placeholder="Find in logs…"
        spellCheck={false}
      />
      {query && (
        <span className="search-count">
          {matchCount} match{matchCount === 1 ? '' : 'es'}
        </span>
      )}
      <button className="icon-btn" onClick={onClose} aria-label="Close search">
        <Icons.Close size={11} />
      </button>
    </div>
  );
}
