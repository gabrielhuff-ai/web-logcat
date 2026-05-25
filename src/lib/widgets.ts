// Widget registry — single source of truth for everything the dashboard
// needs to know about each widget kind: display metadata, default size,
// the React component to render, an enabled flag (for "coming soon"
// kinds), and an optional max-instances cap (Mirror is hard-capped at 1).
//
// Adding a new widget kind in Phase 6–9:
//   1. Build `src/components/widgets/<Kind>Widget.tsx` exporting the
//      component as a named export taking `{ tileId }` props.
//   2. Add an entry below; flip `enabled: true`.
//   3. (Optional) set `maxInstances` if the widget can't co-exist with
//      itself.
// That's the entire registration step — `WidgetPalette` and `TileGrid`
// both consult this registry without further changes.
//
// Phase 10: every non-Logcat widget is wrapped in `React.lazy` so its
// chunk only loads on first add. Logcat stays in the initial bundle —
// it's the default tile and is always rendered the moment the dashboard
// mounts. The biggest win is the Mirror chunk (scrcpy decoder + mp4-
// muxer); Files (Tango sync wrapper) and Dumpsys (parser pack +
// fixtures) come along for the ride. `<Tile/>` wraps the rendered
// `def.comp` in `<Suspense/>` with a small "Loading widget…" fallback.

import { lazy, type ComponentType } from 'react';
import * as Icons from '../components/Icons';
import { LogcatWidget } from '../components/widgets/LogcatWidget';
import type { WidgetKind } from '../types';

export interface WidgetProps {
  /** Stable id of the host tile — used to namespace per-instance state. */
  tileId: string;
}

export interface WidgetDef {
  /** Display name in the palette and tile header. */
  name: string;
  /** Reference into `src/components/Icons.tsx`. */
  icon: ComponentType<{ size?: number }>;
  /** One-line description shown on the palette card. */
  desc: string;
  /** The component to render inside the tile body. */
  comp: ComponentType<WidgetProps>;
  /** Default size in grid cells when the user adds the widget. */
  defaultSize: { w: number; h: number };
  /** False ⇒ palette card is disabled with a "coming soon" tooltip. */
  enabled: boolean;
  /** Hard cap on simultaneous instances of this kind. Undefined ⇒ unlimited. */
  maxInstances?: number;
  /**
   * Whether the widget renders an internal control bar (Logcat's
   * filter-bar, Dumpsys's preset pills, …). False ⇒ the eye-button
   * tristate skips the middle "hide controls" step (Shell has nothing
   * to hide). Defaults to true.
   */
  hasControlBar?: boolean;
  /**
   * Single-letter accelerator surfaced in the Cmd/Ctrl+N quick-add
   * menu. Pressing this key while the menu is open inserts the widget
   * immediately. Must be unique across enabled widgets.
   */
  shortcutKey: string;
}

// `React.lazy` requires a default export. The widget files use named
// exports, so re-shape each promise into `{ default: Component }` as the
// dynamic import resolves. The chunk filenames (`shell-widget`,
// `dumpsys-widget`, etc.) come from Vite's filename hash; verify with
// `npm run build` — each kind shows up as its own file in `dist/assets/`.
const ShellWidgetLazy = lazy(() =>
  import('../components/widgets/ShellWidget').then((m) => ({ default: m.ShellWidget })),
);
const DumpsysWidgetLazy = lazy(() =>
  import('../components/widgets/DumpsysWidget').then((m) => ({
    default: m.DumpsysWidget,
  })),
);
const FilesWidgetLazy = lazy(() =>
  import('../components/widgets/FilesWidget').then((m) => ({ default: m.FilesWidget })),
);
const MirrorWidgetLazy = lazy(() =>
  import('../components/widgets/MirrorWidget').then((m) => ({ default: m.MirrorWidget })),
);
const ScriptingWidgetLazy = lazy(() =>
  import('../components/widgets/ScriptingWidget').then((m) => ({
    default: m.ScriptingWidget,
  })),
);

export const WIDGETS: Record<WidgetKind, WidgetDef> = {
  logcat: {
    name: 'Logcat',
    icon: Icons.Stack,
    desc: 'Live system log stream',
    comp: LogcatWidget,
    defaultSize: { w: 12, h: 8 },
    enabled: true,
    shortcutKey: 'l',
  },
  shell: {
    name: 'Shell',
    icon: Icons.Terminal,
    desc: 'Interactive ADB shell',
    comp: ShellWidgetLazy,
    defaultSize: { w: 5, h: 4 },
    enabled: true,
    // The Shell widget grew a small bar (Restart + Run-as-root toggle)
    // in addition to the prompt itself; flip the registry hint to
    // match so the eye-button tristate keeps the middle "hide
    // controls" state.
    hasControlBar: true,
    shortcutKey: 's',
  },
  dumpsys: {
    name: 'Dumpsys',
    icon: Icons.Dumpsys,
    desc: 'Run preset dumpsys commands',
    comp: DumpsysWidgetLazy,
    defaultSize: { w: 6, h: 6 },
    enabled: true,
    shortcutKey: 'd',
  },
  files: {
    name: 'Files',
    icon: Icons.Folder,
    desc: 'Browse, push & pull device files',
    comp: FilesWidgetLazy,
    defaultSize: { w: 8, h: 6 },
    enabled: true,
    shortcutKey: 'f',
  },
  mirror: {
    name: 'Screen Mirror',
    icon: Icons.Mirror,
    desc: 'scrcpy-style live device screen',
    comp: MirrorWidgetLazy,
    defaultSize: { w: 3, h: 10 },
    enabled: true,
    maxInstances: 1,
    shortcutKey: 'm',
  },
  scripting: {
    name: 'Scripting',
    icon: Icons.Code,
    desc: 'Build your own ADB control panel — one shell script, your controls.',
    comp: ScriptingWidgetLazy,
    defaultSize: { w: 6, h: 7 },
    enabled: true,
    // The body is the panel; there's no separate control bar, so the eye
    // toggle skips the middle "hide bar" state (show ↔ hide chrome) like Shell.
    hasControlBar: false,
    shortcutKey: 'c',
  },
};

/** Iteration helper — preserves the insertion order of WIDGETS. */
export const WIDGET_KINDS: readonly WidgetKind[] = Object.keys(WIDGETS) as WidgetKind[];
