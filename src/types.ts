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
 * One placed widget instance on the dashboard grid.
 *   - `id`         is a stable, string-typed key the layout array is keyed by.
 *   - `x, y, w, h` are integer cells on the 12-column / 56px-row grid; see
 *                  `src/lib/layout.ts` for the snap math.
 *   - `barsHidden` toggles the "hide widget chrome" mode (the eye button
 *                  in the tile header). Optional — absent ⇒ false.
 */
export interface Tile {
  id: string;
  kind: WidgetKind;
  x: number;
  y: number;
  w: number;
  h: number;
  barsHidden?: boolean;
}

/** Shape persisted under `weblogcat-dashboard-v1` in localStorage. */
export type LayoutState = Tile[];
