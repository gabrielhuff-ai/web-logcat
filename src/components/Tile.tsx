// Tile chrome — header (grip / icon / title / eye / maximize / remove) +
// body slot + bottom-right resize grip.
//
// The "body slot" is filled by the widget component pulled from the
// registry. State for drag/resize/maximize lives in `<TileGrid/>`; this
// component is purely presentational + dispatches user intents back up
// via callbacks.

import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import * as Icons from './Icons';
import { WIDGETS } from '../lib/widgets';
import type { Tile as TileT } from '../types';

export interface TileProps {
  tile: TileT;
  /** Whether this tile is the current full-viewport one. */
  maximized: boolean;
  /** Whether this tile is currently being dragged or resized. */
  dragging: boolean;
  /** Inline style — set by `<TileGrid/>` (grid-column / row, or absolute). */
  style: CSSProperties;
  onMoveStart: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onResizeStart: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onToggleBars: () => void;
  onToggleMax: () => void;
  onRemove: () => void;
  /** The widget body — typically `<def.comp tileId={tile.id} />`. */
  children: ReactNode;
}

export function Tile({
  tile,
  maximized,
  dragging,
  style,
  onMoveStart,
  onResizeStart,
  onToggleBars,
  onToggleMax,
  onRemove,
  children,
}: TileProps) {
  const def = WIDGETS[tile.kind];
  const Icon = def.icon;

  const className = [
    'tile',
    dragging && 'dragging',
    maximized && 'max',
    tile.barsHidden && 'bars-hidden',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={className} style={style} data-tile-id={tile.id}>
      <div
        className="tile-head"
        onPointerDown={(e) => {
          if (maximized) return;
          onMoveStart(e);
        }}
      >
        <span className="tile-grip">
          <Icons.Drag size={11} />
        </span>
        <span className="tile-icon">
          <Icon size={12} />
        </span>
        <span className="tile-title">{def.name}</span>
        <span style={{ flex: 1 }} />
        <button
          className="tile-btn tt"
          data-tt={tile.barsHidden ? 'Show widget bar' : 'Hide widget bar'}
          onClick={onToggleBars}
          aria-label={tile.barsHidden ? 'Show widget bar' : 'Hide widget bar'}
        >
          {tile.barsHidden ? <Icons.EyeOff size={11} /> : <Icons.Eye size={11} />}
        </button>
        <button
          className="tile-btn tt"
          data-tt={maximized ? 'Restore' : 'Maximize'}
          onClick={onToggleMax}
          aria-label={maximized ? 'Restore tile' : 'Maximize tile'}
        >
          {maximized ? <Icons.Minimize size={11} /> : <Icons.Maximize size={11} />}
        </button>
        <button
          className="tile-btn tt"
          data-tt="Remove widget"
          onClick={onRemove}
          aria-label="Remove tile"
        >
          <Icons.Close size={11} />
        </button>
      </div>

      <div className="tile-body">{children}</div>

      {!maximized && (
        <div
          className="tile-resize"
          onPointerDown={onResizeStart}
          aria-label="Resize tile"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path
              d="M 11 5 L 5 11 M 11 9 L 9 11 M 11 1 L 1 11"
              stroke="currentColor"
              strokeWidth="1"
              fill="none"
            />
          </svg>
        </div>
      )}
    </div>
  );
}
