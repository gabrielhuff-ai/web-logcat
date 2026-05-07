// Tile chrome — header (grip / icon / title / settings cog / eye /
// maximize / remove) + body slot.
//
// State for swap-drag, focus, and maximize lives in `<TileGrid/>`; this
// component is purely presentational + dispatches user intents back up
// via callbacks. The settings modal is a tile-local concern (modal is
// per-tile so multiple tiles' settings don't conflict) and is owned
// here.
//
// The eye-button cycles through three "chrome" states (`BarMode`):
//   - `'show'`     — head + widget bar both visible (default).
//   - `'hideBars'` — head visible, widget bar hidden.
//   - `'hideHead'` — head hidden, body fills the tile. Hovering the
//                    very top of the tile re-reveals the head and
//                    pushes the body down (the `tile-reveal` strip is
//                    the hover trigger).
// Widgets without an internal control bar (Shell) skip the middle
// state — `<TileGrid/>` handles that via `WIDGETS[kind].hasControlBar`.

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
  /** Cycle the eye-button tristate. */
  onCycleBarMode: () => void;
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
  onCycleBarMode,
  onToggleMax,
  onRemove,
  children,
}: TileProps) {
  const def = WIDGETS[tile.kind];
  const Icon = def.icon;
  const [settingsOpen, setSettingsOpen] = useState(false);

  const barMode = tile.barMode ?? 'show';

  const className = [
    'tile',
    dragging && 'dragging',
    dropTarget && 'drop-target',
    focused && 'focused',
    maximized && 'max',
    barMode === 'hideBars' && 'bars-hidden',
    barMode === 'hideHead' && 'head-hidden',
  ]
    .filter(Boolean)
    .join(' ');

  // Eye-button tooltip describes the *next* state the click will land
  // on. Cycle:
  //   - widget with bar:    show → hideBars → hideHead → show
  //   - widget without bar: show ↔ hideHead
  // Labels are deliberately short (≤ 11 chars) so the `tt::after`
  // tooltip never gets clipped by the tile's `overflow: hidden` when
  // the eye sits near a tile edge — that was breaking the tooltip on
  // the 'hideBars' state for narrow tiles.
  const hasBar = def.hasControlBar !== false;
  const eyeLabel =
    barMode === 'show'
      ? hasBar
        ? 'Hide bar'
        : 'Hide chrome'
      : barMode === 'hideBars'
        ? 'Hide chrome'
        : 'Show bar';
  const EyeIcon = barMode === 'show' ? Icons.Eye : Icons.EyeOff;

  return (
    <div
      className={className}
      style={style}
      data-tile-id={tile.id}
    >
      {/* When `barMode === 'hideHead'` the tile-head is collapsed to
          height 0; this thin strip at the top sits above where the
          head used to live and reveals it on hover. The strip itself
          is invisible (transparent) but `cursor: ns-resize` hints
          there's something there. */}
      {barMode === 'hideHead' && !maximized && (
        <div className="tile-reveal" aria-hidden />
      )}
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
          data-tt={eyeLabel}
          onClick={onCycleBarMode}
          aria-label={eyeLabel}
        >
          <EyeIcon size={11} />
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
