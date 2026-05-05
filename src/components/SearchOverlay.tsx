// Floating search box (⌘F / Ctrl+F). Top-right, esc dismisses.
//
// TODO(sonnet): live search across message/tag/pkg with match count.
// Highlight uses `.hl-search` class (already in app.css).

export interface SearchOverlayProps {
  open: boolean;
  query: string;
  matchCount: number;
  onChange: (q: string) => void;
  onClose: () => void;
}

export function SearchOverlay({ open, query, matchCount, onChange, onClose }: SearchOverlayProps) {
  if (!open) return null;
  return (
    <div className="search-overlay" role="search">
      <input
        autoFocus
        placeholder="Search message / tag / package…"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      />
      <span className="search-count">{matchCount} matches</span>
      <button className="icon-btn" onClick={onClose} aria-label="Close search">
        ✕
      </button>
    </div>
  );
}
