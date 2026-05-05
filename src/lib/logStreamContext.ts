// Context plumbing for the shared `LogStreamHub`. Lives in its own file
// because it has no JSX and shouldn't pull React's full module tree into
// every importer of the hub class itself.

import { createContext, useContext } from 'react';
import type { LogStreamHub } from './logStream';

export const LogStreamContext = createContext<LogStreamHub | null>(null);

/** Read the active `LogStreamHub`. Throws if used outside the dashboard. */
export function useLogStream(): LogStreamHub {
  const v = useContext(LogStreamContext);
  if (!v) {
    throw new Error('useLogStream() must be called inside <LogStreamContext.Provider>');
  }
  return v;
}
