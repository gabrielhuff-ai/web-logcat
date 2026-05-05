// Heatmap gutter / scrubber.
//
// TODO(sonnet): port from design/source/heatmap.jsx. 60 cells (one per
// second of the last minute). Cell color = dominant level in that bucket;
// opacity = log volume. Click a cell jumps to that timestamp.

import type { LogEntry } from '../types';

export function Heatmap(_props: { entries: LogEntry[]; onJumpTo: (ts: number) => void }) {
  return null;
}
