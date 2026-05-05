// Heatmap gutter (left side) + timeline scrubber (bottom).
// Ported from design/source/heatmap.jsx.

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import type { LogLevel } from '../types';

export interface HeatmapBucket {
  count: number;
  dominant: LogLevel;
  secondsAgo: number;
}

export interface HeatmapProps {
  buckets: HeatmapBucket[];
  currentSecond: number;
  onJumpToSecond: (i: number) => void;
}

export function Heatmap({ buckets, currentSecond, onJumpToSecond }: HeatmapProps) {
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
            data-current={i === currentSecond ? '1' : '0'}
            onClick={() => onJumpToSecond(i)}
            title={`${b.count} log${b.count === 1 ? '' : 's'} · ${b.secondsAgo}s ago`}
          />
        );
      })}
    </div>
  );
}

export interface ScrubberProps {
  buckets: HeatmapBucket[];
  viewportStart: number;
  viewportEnd: number;
  onScrub: (pct: number) => void;
  total: number;
}

export function Scrubber({ buckets, viewportStart, viewportEnd, onScrub, total }: ScrubberProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const max = Math.max(1, ...buckets.map((b) => b.count));

  const handle = (clientX: number) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    onScrub(x / rect.width);
  };

  useEffect(() => {
    if (!dragging) return;
    const move = (e: MouseEvent) => handle(e.clientX);
    const up = () => setDragging(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  const vw = `${Math.max(2, (viewportEnd - viewportStart) * 100)}%`;
  const vl = `${viewportStart * 100}%`;

  return (
    <div
      className="scrub"
      ref={ref}
      onMouseDown={(e: ReactMouseEvent<HTMLDivElement>) => {
        setDragging(true);
        handle(e.clientX);
      }}
    >
      <div className="scrub-bg">
        {buckets.map((b, i) => (
          <div
            key={i}
            className={`scrub-bar lvl-${b.dominant}`}
            style={{ '--h': `${(b.count / max) * 100}%` } as CSSProperties}
          />
        ))}
      </div>
      <div className="scrub-window" style={{ left: vl, width: vw }} />
      <div className="scrub-meta">
        <span>
          {total.toLocaleString()} logs · {buckets.length}s window
        </span>
      </div>
    </div>
  );
}
