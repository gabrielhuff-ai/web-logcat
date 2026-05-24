// Per-tile "open the builder" signal.
//
// The Scripting widget's builder is a large standalone modal that the
// widget owns (not the shared WidgetSettingsModal). Two surfaces open it:
// the tile-header cog (lives in Tile.tsx) and the empty-state CTA (lives
// in the widget body). This bus lets Tile.tsx trigger the widget-owned
// modal without threading new props through the generic widget contract.
//
// Keyed by tileId so sibling Scripting tiles stay independent. At most one
// listener per tile (the mounted widget instance).

const listeners = new Map<string, () => void>();

/** Register the open handler for a tile. Returns an unsubscribe fn. */
export function onOpenBuilder(tileId: string, fn: () => void): () => void {
  listeners.set(tileId, fn);
  return () => {
    if (listeners.get(tileId) === fn) listeners.delete(tileId);
  };
}

/** Open the builder for a tile, if its widget is mounted. */
export function openBuilder(tileId: string): void {
  listeners.get(tileId)?.();
}
