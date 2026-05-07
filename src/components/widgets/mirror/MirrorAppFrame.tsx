// Simulated app-on-screen — a modern Pixel-style home screen used when
// the Mirror widget runs against the fake-data path. In real mode the
// WebCodecs canvas takes its place inside the `mr-screen` element.
//
// Layout (360×760 viewBox = roughly Pixel 6 aspect):
//   - Status bar: time + signal / battery glyphs.
//   - At-a-glance row: date + weather (mirrors the Pixel launcher's
//     leading widget).
//   - Big analog clock widget, centred.
//   - 4×2 app grid using stock Google apps drawn as inline SVGs (no
//     external assets — we want the simulated screen to be self-
//     contained).
//   - Search bar (Google "G" + mic + lens).
//   - Dock (5 stock apps).
//   - Gesture pill at the bottom.
//
// All artwork is hand-drawn SVG using flat colours so it stays small +
// renders at any scale.

import type { SimTap } from '../../../lib/scrcpySim';

export interface MirrorAppFrameProps {
  /** Status-bar clock, pre-formatted (`HH:MM`). */
  time: string;
  /** Active tap ripples — see `lib/scrcpySim.ts` for the shape. */
  taps: readonly SimTap[];
}

interface AppIcon {
  /** Display label below the icon. */
  label: string;
  /** Background fill for the rounded squircle. */
  bg: string;
  /** Inline SVG glyph element drawn inside the squircle. */
  glyph: React.ReactNode;
}

const ICON_SIZE = 48;
const ICON_RADIUS = 14;

/** Reusable squircle background. Stock Pixel uses `RoundedRect` icons. */
function Squircle({ x, y, fill }: { x: number; y: number; fill: string }) {
  return (
    <rect
      x={x}
      y={y}
      width={ICON_SIZE}
      height={ICON_SIZE}
      rx={ICON_RADIUS}
      fill={fill}
    />
  );
}

/** Inline glyph helpers. Each emits SVG centred on (0,0) — caller wraps
 *  in a `<g transform="translate(...)">`. */
const Glyphs = {
  phone: (
    <path
      d="M-10 -10 a3 3 0 0 1 3 -3 h4 a3 3 0 0 1 3 3 l1 5 a2 2 0 0 1 -1 2 l-3 2 a16 16 0 0 0 7 7 l2 -3 a2 2 0 0 1 2 -1 l5 1 a3 3 0 0 1 3 3 v4 a3 3 0 0 1 -3 3 C-1 16 -16 1 -16 -10 z"
      fill="white"
      transform="translate(2 2)"
    />
  ),
  messages: (
    <g fill="white">
      <path d="M-12 -8 a4 4 0 0 1 4 -4 h16 a4 4 0 0 1 4 4 v10 a4 4 0 0 1 -4 4 h-12 l-8 6 v-6 a4 4 0 0 1 -4 -4 z" />
      <circle cx="-4" cy="-2" r="1.6" fill="oklch(0.33 0.08 215)" />
      <circle cx="2" cy="-2" r="1.6" fill="oklch(0.33 0.08 215)" />
      <circle cx="8" cy="-2" r="1.6" fill="oklch(0.33 0.08 215)" />
    </g>
  ),
  chrome: (
    <g>
      <circle r="14" fill="white" />
      <circle r="13" fill="oklch(0.6 0.16 30)" />
      <path d="M-13 0 H 13 A13 13 0 0 0 0 -13 Z" fill="oklch(0.78 0.16 130)" />
      <path d="M0 13 A13 13 0 0 0 13 0 H 0 Z" fill="oklch(0.85 0.18 90)" />
      <path d="M-13 0 A13 13 0 0 0 0 13 V 0 Z" fill="oklch(0.55 0.16 250)" />
      <circle r="6" fill="oklch(0.55 0.16 250)" />
      <circle r="4.5" fill="white" />
    </g>
  ),
  camera: (
    <g fill="white">
      <rect x="-13" y="-9" width="26" height="18" rx="3" />
      <rect x="-3" y="-12" width="6" height="3" rx="1" />
      <circle cx="0" cy="0" r="6" fill="oklch(0.45 0.1 250)" />
      <circle cx="0" cy="0" r="3.5" fill="oklch(0.85 0.04 250)" />
    </g>
  ),
  photos: (
    <g>
      <path d="M0 -13 A13 13 0 0 1 13 0 H 0 Z" fill="oklch(0.78 0.18 60)" />
      <path d="M13 0 A13 13 0 0 1 0 13 V 0 Z" fill="oklch(0.7 0.18 30)" />
      <path d="M0 13 A13 13 0 0 1 -13 0 H 0 Z" fill="oklch(0.6 0.2 250)" />
      <path d="M-13 0 A13 13 0 0 1 0 -13 V 0 Z" fill="oklch(0.78 0.18 140)" />
    </g>
  ),
  maps: (
    <g>
      <path
        d="M0 -14 a8 8 0 0 1 8 8 c0 6 -8 14 -8 14 s-8 -8 -8 -14 a8 8 0 0 1 8 -8 z"
        fill="oklch(0.65 0.2 25)"
      />
      <circle cy="-6" r="3.2" fill="white" />
    </g>
  ),
  calendar: (
    <g fill="white">
      <rect x="-13" y="-11" width="26" height="22" rx="3" />
      <rect x="-13" y="-11" width="26" height="6" rx="3" fill="oklch(0.55 0.18 250)" />
      <text
        textAnchor="middle"
        y="6"
        fill="oklch(0.4 0 0)"
        fontSize="12"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
      >
        14
      </text>
    </g>
  ),
  clock: (
    <g>
      <circle r="13" fill="white" />
      <circle r="13" fill="none" stroke="oklch(0.4 0 0)" strokeWidth="1.5" />
      <line x1="0" y1="0" x2="0" y2="-7" stroke="oklch(0.2 0 0)" strokeWidth="1.5" />
      <line x1="0" y1="0" x2="5" y2="3" stroke="oklch(0.55 0.18 30)" strokeWidth="1.5" />
      <circle r="1.5" fill="oklch(0.2 0 0)" />
    </g>
  ),
  gmail: (
    <g>
      <rect x="-13" y="-10" width="26" height="20" rx="3" fill="white" />
      <path d="M-13 -10 L 0 0 L 13 -10 Z" fill="oklch(0.6 0.18 30)" />
      <path
        d="M-13 -10 L 0 0 L 13 -10 V 10 H -13 Z"
        fill="none"
        stroke="oklch(0.7 0 0)"
        strokeWidth="0.6"
      />
    </g>
  ),
  ytmusic: (
    <g>
      <circle r="13" fill="oklch(0.55 0.22 25)" />
      <polygon points="-4,-6 -4,6 7,0" fill="white" />
    </g>
  ),
  drive: (
    <g>
      <path d="M-3 -12 H 11 L 4 0 H -11 Z" fill="oklch(0.78 0.16 90)" />
      <path d="M-3 -12 L -11 0 L -4 12 L 4 0 Z" fill="oklch(0.6 0.18 145)" />
      <path d="M11 -12 L 12 12 L -4 12 L 4 0 Z" fill="oklch(0.55 0.16 245)" />
    </g>
  ),
  files: (
    <g fill="white">
      <path d="M-12 -10 H -2 L 0 -7 H 12 V 10 H -12 Z" />
      <path
        d="M-12 -10 H -2 L 0 -7 H 12 V 10 H -12 Z"
        fill="none"
        stroke="oklch(0.7 0 0)"
        strokeWidth="0.6"
      />
    </g>
  ),
} satisfies Record<string, React.ReactNode>;

const APP_GRID: readonly AppIcon[] = [
  { label: 'Phone', bg: 'oklch(0.55 0.18 145)', glyph: Glyphs.phone },
  { label: 'Messages', bg: 'oklch(0.55 0.16 215)', glyph: Glyphs.messages },
  { label: 'Camera', bg: 'oklch(0.18 0.02 250)', glyph: Glyphs.camera },
  { label: 'Maps', bg: 'oklch(0.95 0.02 100)', glyph: Glyphs.maps },
  { label: 'Calendar', bg: 'white', glyph: Glyphs.calendar },
  { label: 'Clock', bg: 'oklch(0.85 0.04 250)', glyph: Glyphs.clock },
  { label: 'Drive', bg: 'white', glyph: Glyphs.drive },
  { label: 'Gmail', bg: 'white', glyph: Glyphs.gmail },
];

const DOCK: readonly AppIcon[] = [
  { label: 'Phone', bg: 'oklch(0.55 0.18 145)', glyph: Glyphs.phone },
  { label: 'Files', bg: 'oklch(0.55 0.16 250)', glyph: Glyphs.files },
  { label: 'Chrome', bg: 'white', glyph: Glyphs.chrome },
  { label: 'Photos', bg: 'white', glyph: Glyphs.photos },
  { label: 'YT Music', bg: 'white', glyph: Glyphs.ytmusic },
];

export function MirrorAppFrame({ time, taps }: MirrorAppFrameProps) {
  // Top-row + grid layout maths. Grid origin (16, 320), 4 columns over
  // 360 - 32 = 328px → 82px per cell, icons centred at 41px.
  const cellW = 82;
  const cellH = 88;
  const colX = (i: number) => 16 + i * cellW + cellW / 2;
  const rowY = (i: number) => 320 + i * cellH + ICON_SIZE / 2;

  return (
    <svg
      viewBox="0 0 360 760"
      preserveAspectRatio="xMidYMid meet"
      className="mirror-svg"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Soft Material-You-style gradient wallpaper. */}
        <linearGradient id="mr-wall" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="oklch(0.5 0.14 220)" />
          <stop offset="55%" stopColor="oklch(0.45 0.18 280)" />
          <stop offset="100%" stopColor="oklch(0.35 0.18 320)" />
        </linearGradient>
        <radialGradient id="mr-glow" cx="0.3" cy="0.2" r="0.7">
          <stop offset="0%" stopColor="oklch(0.78 0.18 60 / 0.35)" />
          <stop offset="100%" stopColor="oklch(0.4 0.1 280 / 0)" />
        </radialGradient>
        <clipPath id="mr-clip">
          <rect x="0" y="0" width="360" height="760" rx="0" />
        </clipPath>
      </defs>

      {/* Wallpaper */}
      <rect x="0" y="0" width="360" height="760" fill="url(#mr-wall)" />
      <rect x="0" y="0" width="360" height="760" fill="url(#mr-glow)" />

      <g clipPath="url(#mr-clip)">
        {/* Status bar */}
        <text
          x="20"
          y="22"
          fill="white"
          fontSize="13"
          fontWeight="600"
          fontFamily="system-ui, sans-serif"
        >
          {time}
        </text>
        {/* Camera notch */}
        <circle cx="180" cy="14" r="6" fill="oklch(0.05 0 0)" />
        {/* Status icons */}
        <g transform="translate(310 16)" fill="white">
          <path d="M0 4 L1.5 4 L1.5 6 L0 6 Z M3 2 L4.5 2 L4.5 6 L3 6 Z M6 0 L7.5 0 L7.5 6 L6 6 Z" />
          <rect x="14" y="0" width="14" height="6" rx="1.5" />
          <rect x="15" y="1" width="9" height="4" fill="oklch(0.78 0.16 145)" />
          <rect x="28" y="2" width="1.5" height="2" fill="white" />
        </g>

        {/* At-a-glance row */}
        <text
          x="20"
          y="60"
          fill="white"
          fontSize="14"
          fontWeight="600"
          fontFamily="system-ui, sans-serif"
        >
          Tue, May 7
        </text>
        <circle cx="20" cy="76" r="3.5" fill="oklch(0.85 0.16 90)" />
        <text
          x="30"
          y="80"
          fill="oklch(0.95 0.04 100)"
          fontSize="12"
          fontFamily="system-ui, sans-serif"
        >
          19°C · Clear
        </text>

        {/* Big analog clock widget */}
        <g transform="translate(180 180)">
          <circle r="58" fill="oklch(0.97 0.02 80)" />
          <circle r="58" fill="none" stroke="oklch(0.8 0 0)" strokeWidth="0.8" />
          {/* Hour markers */}
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i * Math.PI) / 6;
            const x1 = Math.sin(a) * 50;
            const y1 = -Math.cos(a) * 50;
            const x2 = Math.sin(a) * 56;
            const y2 = -Math.cos(a) * 56;
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="oklch(0.4 0.04 80)"
                strokeWidth={i % 3 === 0 ? '2' : '1'}
              />
            );
          })}
          {/* Hands — pointed at 10:08, the universal "clock face" pose. */}
          <line
            x1="0"
            y1="0"
            x2="-25"
            y2="-12"
            stroke="oklch(0.2 0 0)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <line
            x1="0"
            y1="0"
            x2="38"
            y2="-15"
            stroke="oklch(0.2 0 0)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle r="3" fill="oklch(0.55 0.18 30)" />
          {/* Date label */}
          <text
            y="36"
            textAnchor="middle"
            fill="oklch(0.5 0.04 80)"
            fontSize="10"
            fontWeight="600"
            fontFamily="system-ui, sans-serif"
          >
            TUE 7
          </text>
        </g>

        {/* App grid (4 cols × 2 rows) */}
        {APP_GRID.map((app, i) => {
          const col = i % 4;
          const row = Math.floor(i / 4);
          const cx = colX(col);
          const cy = rowY(row);
          return (
            <g key={app.label + i}>
              <Squircle x={cx - ICON_SIZE / 2} y={cy - ICON_SIZE / 2} fill={app.bg} />
              <g transform={`translate(${cx} ${cy})`}>{app.glyph}</g>
              <text
                x={cx}
                y={cy + ICON_SIZE / 2 + 14}
                textAnchor="middle"
                fill="white"
                fontSize="10"
                fontWeight="500"
                fontFamily="system-ui, sans-serif"
              >
                {app.label}
              </text>
            </g>
          );
        })}

        {/* Google search pill */}
        <g transform="translate(16 600)">
          <rect width="328" height="48" rx="24" fill="oklch(0.97 0.01 250)" />
          <g transform="translate(20 24)">
            {/* Multi-coloured G — simplified two-arc rendition. */}
            <text
              fontFamily="system-ui, sans-serif"
              fontSize="20"
              fontWeight="700"
              y="6"
              fill="oklch(0.55 0.16 250)"
            >
              G
            </text>
          </g>
          <line
            x1="42"
            y1="14"
            x2="42"
            y2="34"
            stroke="oklch(0.85 0 0)"
            strokeWidth="0.6"
          />
          {/* mic + lens icons (simplified) */}
          <g transform="translate(280 24)" fill="oklch(0.55 0.04 250)">
            <rect x="-6" y="-8" width="6" height="11" rx="3" />
            <path d="M-9 -1 a6 6 0 0 0 12 0" stroke="oklch(0.55 0.04 250)" strokeWidth="1.4" fill="none" />
          </g>
          <g transform="translate(305 24)" fill="oklch(0.55 0.04 250)">
            <rect x="-6" y="-6" width="12" height="12" rx="2" />
            <circle r="3" fill="white" />
          </g>
        </g>

        {/* Dock */}
        <g transform="translate(0 670)">
          {DOCK.map((app, i) => {
            const cx = 36 + i * 72;
            const cy = 24;
            return (
              <g key={app.label + i}>
                <Squircle x={cx - ICON_SIZE / 2} y={cy - ICON_SIZE / 2} fill={app.bg} />
                <g transform={`translate(${cx} ${cy})`}>{app.glyph}</g>
              </g>
            );
          })}
        </g>

        {/* Gesture pill */}
        <rect
          x="120"
          y="744"
          width="120"
          height="4"
          rx="2"
          fill="oklch(1 0 0 / 0.6)"
        />

        {/* Tap ripples */}
        {taps.map((t) => (
          <circle
            key={t.id}
            cx={t.x}
            cy={t.y}
            r={t.r}
            fill="none"
            stroke="white"
            strokeWidth="2"
            opacity={t.op}
          />
        ))}
      </g>
    </svg>
  );
}
