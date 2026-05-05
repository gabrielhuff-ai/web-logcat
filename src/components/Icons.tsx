// Inline material-style icon set (24px viewBox, currentColor strokes).
// Ported from design/source/icons.jsx.

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
  'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm9 3.5l-2.1-.5-.6-1.5 1.1-1.8-1.6-1.6-1.8 1.1-1.5-.6L13.5 3h-3l-.5 2.1-1.5.6-1.8-1.1-1.6 1.6 1.1 1.8-.6 1.5L3 10.5v3l2.1.5.6 1.5-1.1 1.8 1.6 1.6 1.8-1.1 1.5.6.5 2.1h3l.5-2.1 1.5-.6 1.8 1.1 1.6-1.6-1.1-1.8.6-1.5L21 13.5z',
  1.4,
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
export const Chevron = make('M6 9l6 6 6-6', 1.7);
export const ChevronRight = make('M9 6l6 6-6 6', 1.7);
export const Device = make('M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm3 18h4', 1.6);
export const Usb = make('M12 2v6m-3-3l3-3 3 3M8 11h8v3a4 4 0 0 1-4 4 4 4 0 0 1-4-4zM12 18v4', 1.6);
export const Wand = make('M5 19l11-11 3 3-11 11zM14 5l1.5-1.5M19 10l1.5-1.5M19 4l-2 2M9 17l-1 4 4-1', 1.6);
export const Down = make('M12 4v15m-6-6l6 6 6-6', 1.7);
export const Lock = make('M7 10V7a5 5 0 0 1 10 0v3m-12 0h14v10H5z', 1.6);
export const Unlock = make('M7 10V7a5 5 0 0 1 9.5-2M5 10h14v10H5z', 1.6);
export const Wrap = make('M3 6h18M3 12h13a4 4 0 1 1 0 8h-2m0 0l3-3m-3 3l3 3M3 18h7', 1.6);
export const Time = make('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2', 1.6);
export const Hash = make('M9 3l-2 18M17 3l-2 18M3 9h18M3 15h18', 1.6);
export const More = make('M5 12a1.4 1.4 0 1 0 0-.01M12 12a1.4 1.4 0 1 0 0-.01M19 12a1.4 1.4 0 1 0 0-.01', 2.2);
export const Refresh = make('M4 12a8 8 0 0 1 14-5.3L20 4v6h-6M20 12a8 8 0 0 1-14 5.3L4 20v-6h6', 1.6);
export const Sun = make(
  'M12 5V2M12 22v-3M5 12H2M22 12h-3M6.3 6.3l-2-2M19.7 19.7l-2-2M6.3 17.7l-2 2M19.7 4.3l-2 2M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  1.6,
);
export const Moon = make('M21 13a9 9 0 1 1-10-10 7 7 0 0 0 10 10z', 1.6);
export const Check = make('M5 12l5 5L20 7', 2);
export const Stack = make('M3 7l9-4 9 4-9 4-9-4zM3 12l9 4 9-4M3 17l9 4 9-4', 1.6);
export const Highlight = make('M5 12l5 5 9-9-5-5zM2 22l4-1-3-3z', 1.6);
