// Persisted UI preferences (theme, accent, density, display toggles, stream speed).
//
// Stored under a single localStorage key as JSON. The hook applies
// `data-theme` / `data-accent` / `data-perf` to <html> as a side effect so
// that CSS custom properties resolve immediately.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Tweaks } from '../types';

const STORAGE_KEY = 'weblogcat:tweaks:v1';

export const DEFAULT_TWEAKS: Tweaks = {
  theme: 'dark',
  accent: 'indigo',
  density: 'cozy',
  showTimestamps: true,
  showPid: false,
  showProcess: true,
  showTag: true,
  showLevel: true,
  wrapLines: false,
  showHeatmap: false,
  streamingSpeed: 1,
  compactMode: false,
  performanceMode: 'auto',
};

function readTweaks(): Tweaks {
  if (typeof localStorage === 'undefined') return DEFAULT_TWEAKS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TWEAKS;
    const parsed = JSON.parse(raw) as Partial<Tweaks>;
    return { ...DEFAULT_TWEAKS, ...parsed };
  } catch {
    return DEFAULT_TWEAKS;
  }
}

function writeTweaks(t: Tweaks): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
  } catch {
    // ignore quota / privacy-mode failures
  }
}

function applyToDocument(t: Tweaks, perf: boolean): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  html.dataset.theme = t.theme;
  html.dataset.accent = t.accent;
  html.dataset.density = t.density;
  html.dataset.compact = t.compactMode ? 'on' : 'off';
  html.dataset.perf = perf ? 'on' : 'off';
}

/**
 * Resolve the user's `performanceMode` setting to a concrete boolean. The
 * `'auto'` resolution is recomputed each render (cheap — `matchMedia` and
 * the WEBGL_debug_renderer_info readout are O(1) lookups) so users can
 * change their system motion preference without reloading.
 */
export function isPerformanceModeOn(t: Tweaks): boolean {
  if (t.performanceMode === 'on') return true;
  if (t.performanceMode === 'off') return false;
  return detectAutoPerf();
}

/**
 * Heuristic auto-detect for `performanceMode === 'auto'`. Returns true on:
 *   - `prefers-reduced-motion: reduce` (system-level opt-out).
 *   - `navigator.deviceMemory <= 4` (mostly older laptops + low-end mobile).
 *   - GPU renderer string contains "intel" — the user-reported pain point
 *     is a 2017 MacBook Pro with Intel Iris/UHD integrated graphics, where
 *     `backdrop-filter` blur dominates the frame budget. Apple Silicon
 *     reports "Apple GPU"/"Apple M…" so it's filtered out.
 *
 * The WebGL renderer probe is wrapped in try/catch and gated on the
 * extension's presence — Firefox/Safari may strip it for privacy. Any
 * failure path falls through to "no auto-enable", which is the safe
 * default (the user can flip the switch manually).
 */
export function detectAutoPerf(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return true;
    }
  } catch {
    /* ignore */
  }
  const dm = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (typeof dm === 'number' && dm > 0 && dm <= 4) return true;
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl') ||
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!gl) return false;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return false;
    const renderer = String(
      gl.getParameter(
        (ext as unknown as { UNMASKED_RENDERER_WEBGL: number })
          .UNMASKED_RENDERER_WEBGL,
      ),
    ).toLowerCase();
    // Intel iGPU on a Mac/PC laptop. Discrete Intel Arc has its own line —
    // skip it, the discrete cards handle blur fine.
    if (renderer.includes('intel') && !renderer.includes('arc')) return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function useTweaks() {
  const [tweaks, setTweaks] = useState<Tweaks>(() => {
    const t = readTweaks();
    applyToDocument(t, isPerformanceModeOn(t));
    return t;
  });

  const performanceModeOn = useMemo(() => isPerformanceModeOn(tweaks), [tweaks]);

  useEffect(() => {
    applyToDocument(tweaks, performanceModeOn);
    writeTweaks(tweaks);
  }, [tweaks, performanceModeOn]);

  const update = useCallback((patch: Partial<Tweaks>) => {
    setTweaks((prev) => ({ ...prev, ...patch }));
  }, []);

  const reset = useCallback(() => setTweaks(DEFAULT_TWEAKS), []);

  return { tweaks, performanceModeOn, update, reset } as const;
}
