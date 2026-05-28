// Pointer → content-fraction math for the Mirror widget. Split out of
// `MirrorWidget.tsx` so the pure helper is unit-testable and the
// component file stays component-shaped (fast-refresh-friendly).
//
// The Mirror canvas / simulator SVG fills `.mr-screen` with
// `object-fit: contain` / `preserveAspectRatio="meet"`. When the
// canvas / SVG aspect doesn't match the tile's, the displayed video is
// letterboxed inside the container. Earlier the widget mapped pointer
// coords through the container rect directly — a tap two-thirds of the
// way across the tile mapped to two-thirds of the *device* screen,
// ignoring the gutter width and landing on a different spot than what
// the user clicked. `contentFrac` recovers the actual displayed rect
// from the source dimensions and divides through that so the mapping
// is faithful regardless of aspect mismatch.

export interface ContentRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Project a client-coordinate pointer into [0..1] inside the displayed
 * (contain-fitted) content. When the source size is unknown (decoder
 * hasn't reported metadata yet) the historical container-rect mapping
 * is used as a fallback.
 */
export function contentFrac(
  rect: ContentRect,
  clientX: number,
  clientY: number,
  srcWidth: number,
  srcHeight: number,
): { fracX: number; fracY: number } {
  if (srcWidth <= 0 || srcHeight <= 0 || rect.width <= 0 || rect.height <= 0) {
    return {
      fracX: rect.width > 0 ? (clientX - rect.left) / rect.width : 0,
      fracY: rect.height > 0 ? (clientY - rect.top) / rect.height : 0,
    };
  }
  const boxAspect = rect.width / rect.height;
  const srcAspect = srcWidth / srcHeight;
  let displayW: number;
  let displayH: number;
  let offsetX: number;
  let offsetY: number;
  if (boxAspect > srcAspect) {
    // Container wider than the source → left/right letterbox.
    displayH = rect.height;
    displayW = displayH * srcAspect;
    offsetX = (rect.width - displayW) / 2;
    offsetY = 0;
  } else {
    // Container taller than the source → top/bottom letterbox.
    displayW = rect.width;
    displayH = displayW / srcAspect;
    offsetX = 0;
    offsetY = (rect.height - displayH) / 2;
  }
  return {
    fracX: (clientX - rect.left - offsetX) / displayW,
    fracY: (clientY - rect.top - offsetY) / displayH,
  };
}
