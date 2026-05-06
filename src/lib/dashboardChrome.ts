// DashboardChromeContext — tweaks + toast plumbing shared with widgets.
//
// Widgets need to read theme/density tweaks (set in the dashboard
// topbar / settings) and call `showToast()` for user-facing acks. Rather
// than thread those through every widget call site, they live on this
// thin context.

import { createContext, useContext } from 'react';
import type { Tweaks } from '../types';

export interface DashboardChromeValue {
  tweaks: Tweaks;
  setTweaks: (patch: Partial<Tweaks>) => void;
  showToast: (msg: string) => void;
  /** Resolved performance-mode boolean ('auto' is auto-detected). */
  performanceModeOn: boolean;
}

export const DashboardChromeContext = createContext<DashboardChromeValue | null>(null);

export function useDashboardChrome(): DashboardChromeValue {
  const v = useContext(DashboardChromeContext);
  if (!v) {
    throw new Error('useDashboardChrome() must be called inside <DashboardChromeContext.Provider>');
  }
  return v;
}
