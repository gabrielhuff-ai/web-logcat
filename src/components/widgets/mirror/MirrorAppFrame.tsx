// Simulated app-on-screen — verbatim port of the `MirrorAppFrame` SVG
// from `design/v2/source/widget-mirror.jsx`. Used when the Mirror
// widget runs against the fake-data path; in real mode the WebCodecs
// canvas takes its place inside the `mr-screen` element.

import type { SimTap } from '../../../lib/scrcpySim';

export interface MirrorAppFrameProps {
  /** Status-bar clock, pre-formatted (`HH:MM`). */
  time: string;
  /** Active tap ripples — see `lib/scrcpySim.ts` for the shape. */
  taps: readonly SimTap[];
}

const CATEGORY_LABELS: readonly string[] = ['All', 'Apparel', 'Tech', 'Home', 'Beauty'];

interface ProductCard {
  x: number;
  y: number;
  fill: string;
  title: string;
  price: string;
  brand: string;
}

const PRODUCTS: readonly ProductCard[] = [
  { x: 16, y: 392, fill: 'url(#mr-card1)', title: 'Sneakers', price: '$89', brand: 'Loop' },
  { x: 188, y: 392, fill: 'url(#mr-card2)', title: 'Headphones', price: '$219', brand: 'AirPro' },
  { x: 16, y: 564, fill: 'url(#mr-card3)', title: 'Plant', price: '$34', brand: 'Verde' },
  { x: 188, y: 564, fill: 'oklch(0.32 0.06 30)', title: 'Lamp', price: '$79', brand: 'Glow' },
];

interface NavTab {
  l: string;
  active?: boolean;
}

const NAV: readonly NavTab[] = [
  { l: 'Home', active: true },
  { l: 'Browse' },
  { l: 'Cart' },
  { l: 'Profile' },
];

export function MirrorAppFrame({ time, taps }: MirrorAppFrameProps) {
  return (
    <svg
      viewBox="0 0 360 760"
      preserveAspectRatio="xMidYMid meet"
      className="mirror-svg"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="mr-banner" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="oklch(0.55 0.18 30)" />
          <stop offset="100%" stopColor="oklch(0.42 0.16 350)" />
        </linearGradient>
        <linearGradient id="mr-card1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.78 0.14 80)" />
          <stop offset="100%" stopColor="oklch(0.65 0.18 60)" />
        </linearGradient>
        <linearGradient id="mr-card2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.72 0.13 220)" />
          <stop offset="100%" stopColor="oklch(0.55 0.18 250)" />
        </linearGradient>
        <linearGradient id="mr-card3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.78 0.13 150)" />
          <stop offset="100%" stopColor="oklch(0.6 0.16 165)" />
        </linearGradient>
        <clipPath id="mr-clip">
          <rect x="0" y="0" width="360" height="760" rx="0" />
        </clipPath>
      </defs>

      {/* Wallpaper */}
      <rect x="0" y="0" width="360" height="760" fill="oklch(0.13 0.02 270)" />

      <g clipPath="url(#mr-clip)">
        {/* Status bar */}
        <rect x="0" y="0" width="360" height="32" fill="oklch(0.1 0.02 270)" />
        <text
          x="20"
          y="21"
          fill="white"
          fontSize="12"
          fontWeight="600"
          fontFamily="ui-sans-serif, system-ui"
        >
          {time}
        </text>
        <g transform="translate(310, 14)">
          <text x="0" y="7" fill="white" fontSize="9.5" fontFamily="ui-sans-serif">
            5G
          </text>
          <rect x="22" y="2" width="20" height="11" rx="2" fill="none" stroke="white" strokeWidth="0.8" />
          <rect x="42" y="5" width="1.5" height="5" fill="white" />
          <rect x="24" y="4" width="14" height="7" rx="0.8" fill="white" />
        </g>

        {/* App bar */}
        <rect x="0" y="32" width="360" height="56" fill="oklch(0.16 0.04 30)" />
        <text x="20" y="68" fill="white" fontSize="20" fontWeight="700" fontFamily="ui-sans-serif">
          Shop
        </text>
        <circle cx="335" cy="60" r="14" fill="oklch(0.3 0.06 30)" />
        <circle cx="335" cy="60" r="14" fill="url(#mr-banner)" opacity="0.6" />
        <text x="335" y="64" textAnchor="middle" fill="white" fontSize="11" fontWeight="600">
          JS
        </text>

        {/* Search bar */}
        <rect x="16" y="100" width="328" height="40" rx="20" fill="oklch(0.22 0.02 270)" />
        <circle cx="36" cy="120" r="6" fill="none" stroke="oklch(0.6 0.04 270)" strokeWidth="1.4" />
        <line x1="40" y1="124" x2="44" y2="128" stroke="oklch(0.6 0.04 270)" strokeWidth="1.4" strokeLinecap="round" />
        <text x="56" y="125" fill="oklch(0.6 0.04 270)" fontSize="13" fontFamily="ui-sans-serif">
          Search products & brands
        </text>

        {/* Hero banner */}
        <rect x="16" y="156" width="328" height="148" rx="14" fill="url(#mr-banner)" />
        <text x="32" y="200" fill="white" fontSize="22" fontWeight="800" fontFamily="ui-sans-serif">
          Holiday Sale
        </text>
        <text x="32" y="222" fill="oklch(0.95 0.02 30)" fontSize="13" fontFamily="ui-sans-serif">
          Up to 60% off everything
        </text>
        <rect x="32" y="248" width="100" height="32" rx="16" fill="white" />
        <text
          x="82"
          y="269"
          textAnchor="middle"
          fill="oklch(0.45 0.18 30)"
          fontSize="12"
          fontWeight="700"
          fontFamily="ui-sans-serif"
        >
          Shop now
        </text>
        <circle cx="290" cy="200" r="36" fill="white" opacity="0.18" />
        <circle cx="320" cy="260" r="22" fill="white" opacity="0.1" />

        {/* Categories chips */}
        <text x="20" y="334" fill="white" fontSize="14" fontWeight="700" fontFamily="ui-sans-serif">
          Categories
        </text>
        {CATEGORY_LABELS.map((label, i) => {
          const x = 20 + i * 66;
          const active = i === 0;
          return (
            <g key={label}>
              <rect
                x={x}
                y={344}
                width="60"
                height="28"
                rx="14"
                fill={active ? 'oklch(0.55 0.18 30)' : 'oklch(0.2 0.02 270)'}
              />
              <text
                x={x + 30}
                y={362}
                textAnchor="middle"
                fill="white"
                fontSize="11"
                fontWeight="600"
                fontFamily="ui-sans-serif"
              >
                {label}
              </text>
            </g>
          );
        })}

        {/* Product grid */}
        {PRODUCTS.map((c, i) => (
          <g key={i}>
            <rect x={c.x} y={c.y} width="156" height="160" rx="12" fill={c.fill} />
            <rect x={c.x} y={c.y + 116} width="156" height="44" rx="0" fill="oklch(0.16 0.03 270)" />
            <text x={c.x + 12} y={c.y + 134} fill="white" fontSize="12" fontWeight="700" fontFamily="ui-sans-serif">
              {c.title}
            </text>
            <text x={c.x + 12} y={c.y + 150} fill="oklch(0.7 0.04 30)" fontSize="10" fontFamily="ui-sans-serif">
              {c.brand} · {c.price}
            </text>
            <circle cx={c.x + 138} cy={c.y + 16} r="12" fill="oklch(0 0 0 / 0.3)" />
            <path
              d={`M ${c.x + 132} ${c.y + 16} a 4 4 0 0 1 6 -2 a 4 4 0 0 1 6 2 c 0 4 -6 6 -6 6 s -6 -2 -6 -6 z`}
              fill="white"
            />
          </g>
        ))}

        {/* Bottom nav */}
        <rect x="0" y="708" width="360" height="52" fill="oklch(0.1 0.02 270)" />
        {NAV.map((tab, i) => (
          <g key={tab.l}>
            <circle
              cx={45 + i * 90}
              cy={727}
              r="10"
              fill="none"
              stroke={tab.active ? 'oklch(0.78 0.18 30)' : 'oklch(0.5 0.04 270)'}
              strokeWidth="1.5"
            />
            <text
              x={45 + i * 90}
              y={747}
              textAnchor="middle"
              fill={tab.active ? 'white' : 'oklch(0.6 0.04 270)'}
              fontSize="10"
              fontWeight={tab.active ? 600 : 400}
              fontFamily="ui-sans-serif"
            >
              {tab.l}
            </text>
          </g>
        ))}

        {/* Tap ripples */}
        {taps.map((t) => (
          <g key={t.id}>
            <circle
              cx={t.x}
              cy={t.y}
              r={t.r}
              fill="none"
              stroke="oklch(0.78 0.18 30)"
              strokeWidth="2"
              opacity={t.op}
            />
            <circle cx={t.x} cy={t.y} r={4} fill="oklch(0.78 0.18 30)" opacity={Math.min(1, t.op * 1.5)} />
          </g>
        ))}
      </g>
    </svg>
  );
}
