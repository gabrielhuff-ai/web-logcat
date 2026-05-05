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

import type { ComponentType } from 'react';
import * as Icons from '../components/Icons';
import { LogcatWidget } from '../components/widgets/LogcatWidget';
import { StubWidget } from '../components/widgets/StubWidget';
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
}

export const WIDGETS: Record<WidgetKind, WidgetDef> = {
  logcat: {
    name: 'Logcat',
    icon: Icons.Stack,
    desc: 'Live system log stream',
    comp: LogcatWidget,
    defaultSize: { w: 12, h: 8 },
    enabled: true,
  },
  shell: {
    name: 'Shell',
    icon: Icons.Terminal,
    desc: 'Interactive ADB shell',
    comp: StubWidget,
    defaultSize: { w: 6, h: 6 },
    enabled: false,
  },
  dumpsys: {
    name: 'Dumpsys',
    icon: Icons.Dumpsys,
    desc: 'Run preset dumpsys commands',
    comp: StubWidget,
    defaultSize: { w: 6, h: 6 },
    enabled: false,
  },
  files: {
    name: 'Files',
    icon: Icons.Folder,
    desc: 'Browse, push & pull device files',
    comp: StubWidget,
    defaultSize: { w: 8, h: 6 },
    enabled: false,
  },
  mirror: {
    name: 'Screen Mirror',
    icon: Icons.Mirror,
    desc: 'scrcpy-style live device screen',
    comp: StubWidget,
    defaultSize: { w: 4, h: 8 },
    enabled: false,
    maxInstances: 1,
  },
};

/** Iteration helper — preserves the insertion order of WIDGETS. */
export const WIDGET_KINDS: readonly WidgetKind[] = Object.keys(WIDGETS) as WidgetKind[];
