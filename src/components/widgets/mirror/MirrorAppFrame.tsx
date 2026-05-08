// Simulated app-on-screen — used when the Mirror widget runs against
// the fake-data path. In real mode the WebCodecs canvas takes its
// place inside the `mr-screen` element.
//
// We render a static screenshot (PNG at `public/mirror-home.png`) of a
// real Pixel home screen instead of hand-drawn SVG art. The PNG is
// served from the deploy root (`import.meta.env.BASE_URL` covers the
// GitHub-Pages staging path); if the asset is missing the SVG renders
// the placeholder fallback below so dev mode stays functional. Tap
// ripples are still painted in SVG above the image so they overlay
// cleanly regardless of the underlying art.
//
// To swap in your own device's screenshot, drop a PNG sized roughly
// 1080×2400 (or any 9:20-ish aspect) at `public/mirror-home.png`.

import type { SimTap } from '../../../lib/scrcpySim';

export interface MirrorAppFrameProps {
  /** Status-bar clock, pre-formatted (`HH:MM`). */
  time: string;
  /** Active tap ripples — see `lib/scrcpySim.ts` for the shape. */
  taps: readonly SimTap[];
}

const HOME_IMG = `${import.meta.env.BASE_URL}mirror-home.png`;
const VIEWBOX_W = 360;
const VIEWBOX_H = 760;

export function MirrorAppFrame({ time, taps }: MirrorAppFrameProps) {
  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="mirror-svg"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Pixel home-screen screenshot. `xlinkHref` for broader SVG-1.1
          tooling, `href` for SVG 2; both are accepted by browsers.
          `meet` here too: any aspect mismatch between the PNG and the
          SVG viewBox (e.g. a 9:20 PNG inside a 360×760 viewBox) leaves
          slim transparent slack instead of clipping the status bar
          or nav buttons. The slack reveals the widget body since
          `.mr-screen` is transparent. */}
      <image
        href={HOME_IMG}
        xlinkHref={HOME_IMG}
        x={0}
        y={0}
        width={VIEWBOX_W}
        height={VIEWBOX_H}
        preserveAspectRatio="xMidYMid meet"
      />

      {/* Live status-bar clock overlay. The screenshot has its own
          baked-in time, but rendering a translucent pill over the top
          left keeps the simulator feeling alive without obscuring the
          screenshot's own clock. Toggle visibility via opacity if the
          screenshot's clock is too far off. */}
      <g opacity="0">
        <rect
          x="12"
          y="6"
          width="44"
          height="20"
          rx="10"
          fill="oklch(0 0 0 / 0.55)"
        />
        <text
          x="34"
          y="20"
          textAnchor="middle"
          fill="white"
          fontSize="11"
          fontWeight="600"
          fontFamily="system-ui, sans-serif"
        >
          {time}
        </text>
      </g>

      {/* Tap ripples on top of everything. */}
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
    </svg>
  );
}
