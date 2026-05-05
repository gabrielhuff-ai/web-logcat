// Persisted UI preferences (theme, accent, density, display toggles, stream speed).
//
// Stored under a single localStorage key as JSON. The hook applies
// `data-theme` / `data-accent` to <html> as a side effect so that CSS
// custom properties resolve immediately.

import { useCallback, useEffect, useState } from 'react';
import type { Tweaks } from '../types';

const STORAGE_KEY = 'weblogcat:tweaks:v1';

export const DEFAULT_TWEAKS: Tweaks = {
  theme: 'dark',
  accent: 'indigo',
  density: 'cozy',
  showTimestamps: true,
  showPid: false,
  wrapLines: false,
  showHeatmap: false,
  showScrubber: false,
  streamingSpeed: 1,
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

function applyToDocument(t: Tweaks): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  html.dataset.theme = t.theme;
  html.dataset.accent = t.accent;
  html.dataset.density = t.density;
}

export function useTweaks() {
  const [tweaks, setTweaks] = useState<Tweaks>(() => {
    const t = readTweaks();
    applyToDocument(t);
    return t;
  });

  useEffect(() => {
    applyToDocument(tweaks);
    writeTweaks(tweaks);
  }, [tweaks]);

  const update = useCallback((patch: Partial<Tweaks>) => {
    setTweaks((prev) => ({ ...prev, ...patch }));
  }, []);

  const reset = useCallback(() => setTweaks(DEFAULT_TWEAKS), []);

  return { tweaks, update, reset } as const;
}
