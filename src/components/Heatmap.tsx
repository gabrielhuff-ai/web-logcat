// Heatmap gutter — vertical 60-cell strip on the left of the log area.
//
// Each cell represents one second of the last minute (oldest at top, "now"
// at the bottom). Cell color = dominant level in that bucket;
// opacity = log volume relative to the busiest second on screen.
// Click a cell to scroll the log list to that second.
//
// We previously also exported a horizontal `Scrubber` for the bottom of the
// app (a wider rendering of the same buckets with a mock viewport
// rectangle). It was redundant with this gutter — same data, no
// interactivity that the heatmap didn't already provide — so it was
// removed.

import type { LogLevel } from '../types';

export interface HeatmapBucket {
  count: number;
  dominant: LogLevel;
  secondsAgo: number;
}

export interface HeatmapProps {
  buckets: HeatmapBucket[];
  onJumpToSecond: (i: number) => void;
}

export function Heatmap({ buckets, onJumpToSecond }: HeatmapProps) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <div className="heatmap">
      {buckets.map((b, i) => {
        const intensity = Math.min(1, b.count / max);
        return (
          <button
            key={i}
            className={`hm-cell lvl-${b.dominant}`}
            style={{ opacity: 0.15 + intensity * 0.85 }}
            onClick={() => onJumpToSecond(i)}
            title={`${b.count} log${b.count === 1 ? '' : 's'} · ${b.secondsAgo}s ago`}
          />
        );
      })}
    </div>
  );
}
