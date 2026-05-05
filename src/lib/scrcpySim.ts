// scrcpy simulator fallback — used when `useAdb().usingFake` is true.
//
// In real mode the Mirror widget streams H.264 from `lib/scrcpy.ts`
// through WebCodecs into a `<canvas>`. There's nothing useful to
// simulate at the codec level — instead we render the design's canned
// shopping-app SVG (`MirrorAppFrame` ported from
// `design/v2/source/widget-mirror.jsx`) and tag every interaction with
// a "simulated" toast so the user knows the buttons are no-ops.
//
// This file owns:
//   - The animation state needed by the SVG (live clock, taps).
//   - A small set of pure helpers shared with the widget renderer
//     (formatting record-time, tap-ripple decay).
//
// No WebUSB / scrcpy types leak in — keeping the sim path importable
// without dragging the yume-chan tree into the simulator chunk.

/** A single tap-ripple animation in flight. */
export interface SimTap {
  id: number;
  /** SVG-space x (0..360). */
  x: number;
  /** SVG-space y (0..760). */
  y: number;
  /** Current radius, grows over time. */
  r: number;
  /** Current opacity, decays over time. */
  op: number;
}

/** Decay one frame of tap ripples. Pure — exported for unit tests. */
export function stepTaps(taps: SimTap[]): SimTap[] {
  return taps
    .map((t) => ({ ...t, r: t.r + 2.5, op: t.op - 0.05 }))
    .filter((t) => t.op > 0);
}

/** Format a record duration as `MM:SS`. */
export function formatRecordTime(seconds: number): string {
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/** Format the simulated status-bar clock as `HH:MM`. */
export function formatStatusClock(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
