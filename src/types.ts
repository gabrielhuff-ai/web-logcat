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
  wrapLines: boolean;
  showHeatmap: boolean;
  showScrubber: boolean;
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
