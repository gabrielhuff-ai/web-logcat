// AdbProvider — sole exporter so the file is fast-refresh-safe (the
// `AdbContext` constant + `useAdb()` hook live next door in
// `adbContext.ts`).

import { useMemo, type ReactNode } from 'react';
import type { Adb } from '@yume-chan/adb';
import type { DeviceInfo } from '../types';
import type { LogStream } from './adb';
import { AdbContext, type AdbContextValue } from './adbContext';

export interface AdbProviderProps {
  device: DeviceInfo | null;
  adb: Adb | null;
  stream: LogStream | null;
  usingFake: boolean;
  children: ReactNode;
}

export function AdbProvider({
  device,
  adb,
  stream,
  usingFake,
  children,
}: AdbProviderProps) {
  const value = useMemo<AdbContextValue>(
    () => ({ device, adb, stream, usingFake }),
    [device, adb, stream, usingFake],
  );
  return <AdbContext.Provider value={value}>{children}</AdbContext.Provider>;
}
