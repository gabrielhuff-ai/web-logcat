// Tile chrome — header (grip / icon / title / settings cog / eye /
// maximize / remove) + body slot.
//
// State for swap-drag, focus, and maximize lives in `<TileGrid/>`; this
// component is purely presentational + dispatches user intents back up
// via callbacks. The settings modal, however, is a tile-local concern
// (modal is per-tile so multiple tiles' settings don't conflict) and is
// owned here.
//
// In the dwindle layout there is no per-tile resize grip — every tile's
// bounds are dictated by the binary tree, and resizing happens at the
// seam between two siblings (rendered by `<TileGrid/>` as
// `.dash-split-handle`).

import {
  Suspense,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import * as Icons from './Icons';
import { WIDGETS } from '../lib/widgets';
import { WidgetSettingsModal } from './WidgetSettingsModal';
import type { Tile as TileT } from '../types';

export interface TileProps {
  tile: TileT;
  /** Whether this tile is the current full-viewport one. */
  maximized: boolean;
  /** Whether this tile is currently being dragged (swap source). */
  dragging: boolean;
  /** Whether this tile is the live drop target during a swap drag. */
  dropTarget: boolean;
  /** Whether this tile is the focused leaf (next "+ Add" splits here). */
  focused: boolean;
  /** Inline style — set by `<TileGrid/>` (flex sizing, or absolute when maximised). */
  style: CSSProperties;
  onMoveStart: (e: ReactPointerEvent<HTMLDivElement>) => void;
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
  dropTarget,
  focused,
  style,
  onMoveStart,
  onToggleBars,
  onToggleMax,
  onRemove,
  children,
}: TileProps) {
  const def = WIDGETS[tile.kind];
  const Icon = def.icon;
  const [settingsOpen, setSettingsOpen] = useState(false);

  const className = [
    'tile',
    dragging && 'dragging',
    dropTarget && 'drop-target',
    focused && 'focused',
    maximized && 'max',
    tile.barsHidden && 'bars-hidden',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={className}
      style={style}
      data-tile-id={tile.id}
    >
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
          data-tt="Widget settings"
          onClick={() => setSettingsOpen(true)}
          aria-label="Widget settings"
        >
          <Icons.Settings size={11} />
        </button>
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

      <div className="tile-body">
        <Suspense fallback={<div className="tile-loading">Loading widget…</div>}>
          {children}
        </Suspense>
      </div>

      {settingsOpen && (
        <WidgetSettingsModal
          tileId={tile.id}
          kind={tile.kind}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
