// Shared domain types for WebLogcat.

export type LogLevel = 'V' | 'D' | 'I' | 'W' | 'E';

export interface LogEntry {
  /** Monotonic id assigned at ingest time. */
  id: number;
  /** Unix epoch milliseconds. */
  ts: number;
  pid: number;
  tid: number;
  /** Process / package name (e.g. "com.example.shopapp"). */
  pkg: string;
  /** Logcat tag (e.g. "ActivityManager"). */
  tag: string;
  level: LogLevel;
  message: string;
  /** True for stack-trace continuation lines belonging to a crash group. */
  isCrashLine?: boolean;
}

export type FilterType = 'process' | 'tag' | 'pid' | 'level' | 'message';

export interface Filter {
  id: number;
  type: FilterType;
  /** User-entered value (for `level` it's normalised to a single letter at match time). */
  value: string;
  /** 1..N — index into the chip palette. */
  color: number;
}

export interface HighlightRange {
  start: number;
  end: number;
  color: number;
}

export type Theme = 'light' | 'dark';
export type Accent = 'indigo' | 'teal' | 'amber' | 'rose';
export type Density = 'compact' | 'cozy' | 'comfortable';

export interface Tweaks {
  theme: Theme;
  accent: Accent;
  density: Density;
  showTimestamps: boolean;
  showPid: boolean;
  showProcess: boolean;
  showTag: boolean;
  showLevel: boolean;
  wrapLines: boolean;
  showHeatmap: boolean;
  /** Multiplier applied to the simulated stream rate (1 = default). */
  streamingSpeed: number;
  /**
   * Compact mode — collapses the gap between tiles and removes their rounded
   * corners so widgets cover every pixel of the dashboard. A single tile in
   * compact mode looks identical to a maximised tile.
   */
  compactMode: boolean;
}

export type LevelEnabled = Record<LogLevel, boolean>;

export interface DeviceInfo {
  /** ADB serial. */
  serial: string;
  model: string;
  /** Android version (e.g. "14"). */
  androidVersion: string;
  /** True for the simulated device used in dev. */
  fake?: boolean;
}

// ---- v2: dashboard / tiles / widgets ----------------------------------------

/** Discriminator for the widget kinds shipped (or planned) by the dashboard. */
export type WidgetKind = 'logcat' | 'shell' | 'dumpsys' | 'files' | 'mirror';

/**
 * One placed widget instance on the dashboard.
 *   - `id`         stable, string-typed key the tile is referenced by.
 *   - `kind`       widget kind discriminator.
 *   - `barsHidden` toggles the "hide widget chrome" mode (the eye button
 *                  in the tile header). Optional — absent ⇒ false.
 */
export interface Tile {
  id: string;
  kind: WidgetKind;
  barsHidden?: boolean;
}

/**
 * Hyprland-style binary-tree (dwindle) layout. The dashboard is rendered as
 * a chain of nested splits: each internal node divides its parent area
 * along one axis with a configurable ratio, and each leaf hosts one tile.
 *
 *   - `split.dir = 'row'` lays children left↔right (a vertical seam).
 *   - `split.dir = 'col'` lays children top↕bottom (a horizontal seam).
 *   - `ratio` is the size of `a` as a fraction of the split's available
 *     space (clamped at runtime — see `src/lib/layout.ts`).
 */
export type LayoutNode =
  | { type: 'leaf'; id: string }
  | {
      type: 'split';
      dir: 'row' | 'col';
      ratio: number;
      a: LayoutNode;
      b: LayoutNode;
    };

/**
 * Persisted dashboard state.
 *   - `tiles` keyed by id; the leaves of `tree` reference these ids.
 *   - `tree`  is the spatial arrangement (or `null` when no widgets are
 *             placed — the empty state).
 *   - `focusId` is the leaf that the next "+ Add widget" should split.
 *               When null we split the deepest right-bottom leaf.
 *
 * Stored under `weblogcat-dashboard-v2` in localStorage. The legacy v1
 * key is intentionally not migrated — there are no users yet.
 */
export interface LayoutState {
  tiles: Record<string, Tile>;
  tree: LayoutNode | null;
  focusId: string | null;
}
