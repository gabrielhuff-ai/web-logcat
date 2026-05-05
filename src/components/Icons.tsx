// Inline SVG icon set. 24×24 viewBox, currentColor strokes.
//
// TODO(sonnet): port the rest of the icons from design/source/icons.jsx.
// Keeping just the few used by the current scaffold so the foundation
// compiles without dead code. Add icons as components are filled in.

import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function UsbIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 2v18" />
      <circle cx="12" cy="3" r="1.4" fill="currentColor" stroke="none" />
      <path d="M7 8h10" />
      <path d="M9 8v3a3 3 0 0 0 6 0V8" />
      <path d="M12 14l4-3" />
      <path d="M16 11l1.5-1.5" />
    </svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 4l14 8-14 8V4z" fill="currentColor" stroke="none" />
    </svg>
  );
}
