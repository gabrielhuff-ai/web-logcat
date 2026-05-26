// Inline material-style icon set (24px viewBox, currentColor strokes).
// Ported from design/v1/source/icons.jsx.

import type { CSSProperties, SVGProps } from 'react';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children' | 'stroke'> {
  size?: number;
  style?: CSSProperties;
}

interface InternalIconProps extends IconProps {
  d: string;
  /** Stroke width for outline-style icons. undefined = filled. */
  strokeW?: number;
}

function Icon({ d, size = 16, strokeW, style, ...rest }: InternalIconProps) {
  const isStroked = strokeW != null && strokeW > 0;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={isStroked ? 'none' : 'currentColor'}
      stroke={isStroked ? 'currentColor' : undefined}
      strokeWidth={strokeW ?? 0}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      {...rest}
    >
      <path d={d} />
    </svg>
  );
}

const make =
  (d: string, strokeW?: number) =>
  (p: IconProps = {}) => <Icon {...p} d={d} strokeW={strokeW} />;

export const Play = make('M8 5.5v13l11-6.5z');
export const Pause = make('M7 5h3v14H7zM14 5h3v14h-3z');
export const Clear = make('M6 6h12l-1.2 12.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8zM9 4h6v2H9zM4 6h16', 1.6);
export const Search = make('M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm5.2 12.2L21 21', 1.7);
export const Save = make('M5 4h11l3 3v13H5zM8 4v6h8V4M8 14h8v6H8z', 1.6);
export const Settings = make(
  'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z M9 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0z',
  1.6,
);
export const Filter = make('M3 5h18l-7 9v5l-4-2v-3z', 1.6);
export const FilterFilled = make('M3 5h18l-7 9v5l-4-2v-3z');
export const Close = make('M6 6L18 18M18 6L6 18', 1.8);
export const Plus = make('M12 5v14M5 12h14', 1.8);
export const Pin = make('M14 3l7 7-3 1-2 6-3-3-5 5-1-1 5-5-3-3 6-2z', 1.5);
export const PinFilled = make('M14 3l7 7-3 1-2 6-3-3-5 5-1-1 5-5-3-3 6-2z');
export const Eye = make('M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 1.6);
export const EyeOff = make(
  'M3 3l18 18M10.6 10.6a3 3 0 0 0 4 4M9 5.5C10 5.2 11 5 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 4M6 7.5C3.5 9.4 2 12 2 12s4 7 10 7c1.5 0 2.9-.3 4.2-.9',
  1.6,
);
// Eye with a horizontal bar across the middle — the "intermediate"
// state of the tile-chrome tristate. Reads as "partially obscured"
// without the full closed-eye slash that EyeOff implies. Used for
// `barMode === 'hideBars'`.
export const EyeMinus = make(
  'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM7 12h10',
  1.6,
);
export const Chevron = make('M6 9l6 6 6-6', 1.7);
export const ChevronRight = make('M9 6l6 6-6 6', 1.7);
export const Device = make('M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm3 18h4', 1.6);
export const Usb = make('M12 2v6m-3-3l3-3 3 3M8 11h8v3a4 4 0 0 1-4 4 4 4 0 0 1-4-4zM12 18v4', 1.6);
export const Wand = make('M5 19l11-11 3 3-11 11zM14 5l1.5-1.5M19 10l1.5-1.5M19 4l-2 2M9 17l-1 4 4-1', 1.6);
// Four-point sparkle. Used for the "Simulated log stream" badge —
// reads cleanly at 12px where Wand's tiny detail strokes pixelated.
export const Sparkle = make('M12 3l1.6 5.4 5.4 1.6-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z');
export const Down = make('M12 4v15m-6-6l6 6 6-6', 1.7);
export const Lock = make('M7 10V7a5 5 0 0 1 10 0v3m-12 0h14v10H5z', 1.6);
export const Unlock = make('M7 10V7a5 5 0 0 1 9.5-2M5 10h14v10H5z', 1.6);
export const Wrap = make('M3 6h18M3 12h13a4 4 0 1 1 0 8h-2m0 0l3-3m-3 3l3 3M3 18h7', 1.6);
export const Time = make('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2', 1.6);
export const Hash = make('M9 3l-2 18M17 3l-2 18M3 9h18M3 15h18', 1.6);
export const More = make('M5 12a1.4 1.4 0 1 0 0-.01M12 12a1.4 1.4 0 1 0 0-.01M19 12a1.4 1.4 0 1 0 0-.01', 2.2);
export const Refresh = make(
  'M3 12a9 9 0 0 1 9-9 9.7 9.7 0 0 1 6.74 2.74L21 8 M21 3v5h-5 M21 12a9 9 0 0 1-9 9 9.7 9.7 0 0 1-6.74-2.74L3 16 M3 21v-5h5',
  1.6,
);
export const Sun = make(
  'M12 5V2M12 22v-3M5 12H2M22 12h-3M6.3 6.3l-2-2M19.7 19.7l-2-2M6.3 17.7l-2 2M19.7 4.3l-2 2M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  1.6,
);
export const Moon = make('M21 13a9 9 0 1 1-10-10 7 7 0 0 0 10 10z', 1.6);
export const Check = make('M5 12l5 5L20 7', 2);
export const Stack = make('M3 7l9-4 9 4-9 4-9-4zM3 12l9 4 9-4M3 17l9 4 9-4', 1.6);
export const Highlight = make('M5 12l5 5 9-9-5-5zM2 22l4-1-3-3z', 1.6);

// ---- v2: dashboard / palette / tile chrome icons ----------------------------
export const Terminal = make(
  'M3 4h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM6 9l4 3-4 3M12 15h6',
  1.6,
);
export const Folder = make(
  'M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  1.6,
);
export const Mirror = make(
  'M5 3h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 21h8M12 17v4',
  1.6,
);
export const Dumpsys = make('M4 4h16v6H4zM4 14h16v6H4zM7 7h.01M7 17h.01M11 7h6M11 17h6', 1.6);
export const Drag = make('M9 4h2v2H9zM13 4h2v2h-2zM9 11h2v2H9zM13 11h2v2h-2zM9 18h2v2H9zM13 18h2v2h-2z');
export const Maximize = make(
  'M4 4h6M4 4v6M20 4h-6M20 4v6M4 20h6M4 20v-6M20 20h-6M20 20v-6',
  1.8,
);
export const Minimize = make('M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5', 1.8);
export const Layout = make('M3 4h18v16H3zM3 10h18M9 10v10', 1.6);

// ---- v2: mirror widget — hardware-button + record/screenshot icons --------
// Lifted from `design/v2/source/icons.jsx`. The strokes are 1.6 to match the
// rest of the v2 set; sizes are passed at the call site (the Mirror toolbar
// uses 12–13px).
export const Camera = make(
  'M4 8a2 2 0 0 1 2-2h2l2-2h4l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  1.6,
);
export const Record = make(
  'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  1.6,
);
export const Stop = make('M5 5h14v14H5z', 1.7);

// Open-book glyph for the topbar "Docs" link. Two facing pages with a
// centre spine — reads as "documentation" at 13px without leaning on
// strokes thinner than the rest of the v2 icon set.
export const Book = make(
  'M4 5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z',
  1.6,
);

// GitHub mark — solid silhouette at 24px viewBox so it sits on the
// topbar at the same visual weight as the other icon-button glyphs.
export const Github = make(
  'M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55 0-.27-.01-1.18-.01-2.14-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.27-1.69-1.27-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.69 1.24 3.35.95.1-.74.4-1.24.72-1.53-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.92 10.92 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.4-5.25 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.79-.01 3.17 0 .31.21.67.8.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z',
);

// ---- Scripting widget — control-kind glyphs + builder chrome ---------------
// Ported from design/scripting/source/icons.jsx (24px viewBox, currentColor,
// strokes matched to the v2 set). Used by the control catalog, the builder's
// kind icons, and the runtime panel.
export const PlayCircle = make('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM10 8.5v7l6-3.5z', 1.4);
export const Copy = make(
  'M9 3h10a2 2 0 0 1 2 2v10M5 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z',
  1.6,
);
export const Trash = make('M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6', 1.6);
export const Edit = make('M4 20h4l11-11-4-4L4 16zM14 6l4 4', 1.6);
export const Battery = make('M3 8h15v8H3zM18 11v2h2v-2z', 1.6);
export const Cpu = make(
  'M6 6h12v12H6zM4 9v2M4 13v2M20 9v2M20 13v2M9 4h2M13 4h2M9 20h2M13 20h2M9 9h6v6H9z',
  1.5,
);
export const Network = make(
  'M2 12a15 15 0 0 1 20 0M5 16a10 10 0 0 1 14 0M8.5 19.5a5 5 0 0 1 7 0M12 22h.01',
  1.6,
);
export const SplitV = make('M3 4h18v16H3zM3 12h18', 1.6);
export const Power = make('M12 3v9M6.3 7.7a8 8 0 1 0 11.4 0', 1.7);
export const Rotate = make(
  'M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5',
  1.6,
);

// ---- Dashboard import / export ---------------------------------------------
export const Upload = make('M12 16V4M6 10l6-6 6 6M4 18v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2', 1.7);
export const Download = make('M12 4v12M6 10l6 6 6-6M4 18v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2', 1.7);
export const Share = make(
  'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  1.6,
);
// Source-code glyph (`</>`) — the Scripting widget's tile + palette icon.
export const Code = make('M9 7l-5 5 5 5M15 7l5 5-5 5M13 5l-2 14', 1.7);
