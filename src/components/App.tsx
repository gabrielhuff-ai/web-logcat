// Root of WebLogcat (v2). Owns the device session + the shared
// `LogStreamHub`; renders `<EmptyState/>` while disconnected and
// `<Dashboard/>` (which hosts a tile grid of widgets) once connected.
//
// All per-widget state (filters, paused, autoScroll, ...) lives in the
// individual widget components — see `src/components/widgets/`.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState, type ConnectStep } from './EmptyState';
import { Dashboard } from './Dashboard';
import { HelpDialog } from './HelpDialog';
import * as Icons from './Icons';
import { useTweaks } from '../lib/tweaks';
import { AdbProvider } from '../lib/AdbProvider';
import { LogStreamHub } from '../lib/logStream';
import { LogStreamContext } from '../lib/logStreamContext';
import { DashboardChromeContext } from '../lib/dashboardChrome';
import type { Adb } from '@yume-chan/adb';
import type { LogStream } from '../lib/adb';
import type { DeviceInfo, LogEntry } from '../types';

type SimulatorAPI = typeof import('../lib/logGenerator');

const FAKE_DEVICE: DeviceInfo = {
  serial: 'fake-device-001',
  model: 'Demo Device',
  androidVersion: '14',
  fake: true,
};

// Batch ingest into the shared hub at most once every FLUSH_MS to avoid
// 200+ re-renders per second on real-device streams. Same shape as the
// v1 ingest path lived in the App component.
const FLUSH_MS = 100;

export function App() {
  const { tweaks, performanceModeOn, update: setTweaks } = useTweaks();

  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [usingFake, setUsingFake] = useState(false);
  const [adb, setAdb] = useState<Adb | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // The shared `LogStreamHub` instance lives for the lifetime of the
  // page so widgets can re-mount without losing the buffer. It's
  // exposed through `<LogStreamContext/>`.
  const hubRef = useRef<LogStreamHub>(new LogStreamHub());

  const realStreamRef = useRef<LogStream | null>(null);
  const simulatorRef = useRef<SimulatorAPI | null>(null);
  const incomingRef = useRef<LogEntry[]>([]);
  const flushTimerRef = useRef<number | null>(null);

  const flushIncoming = useCallback(() => {
    flushTimerRef.current = null;
    const batch = incomingRef.current;
    if (batch.length === 0) return;
    incomingRef.current = [];
    hubRef.current.publishMany(batch);
  }, []);

  const queueEntries = useCallback(
    (entries: LogEntry[]) => {
      if (entries.length === 0) return;
      incomingRef.current.push(...entries);
      if (flushTimerRef.current == null) {
        flushTimerRef.current = window.setTimeout(flushIncoming, FLUSH_MS);
      }
    },
    [flushIncoming],
  );

  const resetIngest = useCallback(() => {
    if (flushTimerRef.current != null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    incomingRef.current = [];
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 1800);
  }, []);

  // ---- Streaming: simulator (real ADB stream is in `connectReal`) ---------
  useEffect(() => {
    if (!device || !usingFake) return;
    const interval = window.setInterval(() => {
      const sim = simulatorRef.current;
      if (!sim) return;
      queueEntries(sim.generateBatch(Date.now(), tweaks.streamingSpeed));
    }, 600);
    return () => window.clearInterval(interval);
  }, [device, usingFake, tweaks.streamingSpeed, queueEntries]);

  // ---- Connection handlers ------------------------------------------------
  const connectFake = useCallback(async () => {
    resetIngest();
    if (!simulatorRef.current) {
      simulatorRef.current = await import('../lib/logGenerator');
    }
    const sim = simulatorRef.current;
    hubRef.current.reset(sim.seedHistory(60, 5));
    setDevice(FAKE_DEVICE);
    // Preserve any already-paired real devices in the picker so the
    // user can flip back without re-pairing. The real ADB connection
    // and log stream stay live in the background; switching back is
    // handled by `switchDevice`.
    setDevices((prev) => {
      const reals = prev.filter((d) => !d.fake);
      return [...reals, FAKE_DEVICE];
    });
    setUsingFake(true);
    showToast('Using simulated log data');
  }, [resetIngest, showToast]);

  const connectReal = useCallback(
    async (setStep?: (step: ConnectStep) => void) => {
      try {
        const { connectDevice, friendlyConnectError } = await import('../lib/adb');
        const result = await connectDevice({
          onEntry: (e) => queueEntries([e]),
          onError: (err) => showToast(friendlyConnectError(err)),
          onPhase: (phase) => {
            if (phase === 'requesting') setStep?.(1);
            else if (phase === 'authenticating') setStep?.(2);
            else if (phase === 'connected') setStep?.(3);
          },
          onDisconnect: () => {
            resetIngest();
            realStreamRef.current = null;
            setDevice(null);
            setDevices([]);
            setAdb(null);
            hubRef.current.reset([]);
            showToast('Device disconnected');
          },
        });
        realStreamRef.current = result.stream;
        hubRef.current.reset([]);
        setDevice(result.device);
        // Keep the demo device in the picker so the user can flip to
        // simulated data without disconnecting the real device — see
        // `switchDevice` for the back-and-forth handler.
        setDevices([result.device, FAKE_DEVICE]);
        setUsingFake(false);
        // Phase 6: thread the live Adb handle into the context so widgets
        // (Shell first) can call `adb.subprocess.shellProtocol?.spawn()`
        // without each opening their own WebUSB connection.
        setAdb(result.adb);
        showToast(`Connected to ${result.device.model}`);
      } catch (err) {
        const { friendlyConnectError } = await import('../lib/adb');
        showToast(friendlyConnectError(err));
        throw err;
      }
    },
    [queueEntries, resetIngest, showToast],
  );

  const connectWdp = useCallback(
    async (wdpDevice: import('../lib/wdp').WdpDevice) => {
      try {
        const [{ connectViaWdp }, { friendlyConnectError }] = await Promise.all([
          import('../lib/wdp'),
          import('../lib/adb'),
        ]);
        const result = await connectViaWdp({
          device: wdpDevice,
          onEntry: (e) => queueEntries([e]),
          onError: (err) => showToast(friendlyConnectError(err)),
          onDisconnect: () => {
            resetIngest();
            realStreamRef.current = null;
            setDevice(null);
            setDevices([]);
            setAdb(null);
            hubRef.current.reset([]);
            showToast('Device disconnected');
          },
        });
        realStreamRef.current = result.stream;
        hubRef.current.reset([]);
        setDevice(result.device);
        setDevices([result.device, FAKE_DEVICE]);
        setUsingFake(false);
        setAdb(result.adb);
        showToast(`Connected to ${result.device.model} via Web Device Proxy`);
      } catch (err) {
        const { friendlyConnectError } = await import('../lib/adb');
        showToast(friendlyConnectError(err));
        throw err;
      }
    },
    [queueEntries, resetIngest, showToast],
  );

  const onDisconnect = useCallback(() => {
    void realStreamRef.current?.stop();
    realStreamRef.current = null;
    resetIngest();
    setDevice(null);
    setDevices([]);
    setUsingFake(false);
    setAdb(null);
    hubRef.current.reset([]);
  }, [resetIngest]);

  const onPairNew = useCallback(async () => {
    onDisconnect();
    try {
      await connectReal();
    } catch {
      // already toasted by connectReal
    }
  }, [onDisconnect, connectReal]);

  const switchDevice = useCallback(
    (d: DeviceInfo) => {
      // Switching to the demo device runs through `connectFake` so the
      // log buffer + simulator interval flip cleanly. Real devices
      // stay live in the background — the picker keeps both rows
      // available so the user can flip back and forth.
      if (d.fake) {
        void connectFake();
        return;
      }
      // Re-attach the real-device stream into the hub. `connectFake`
      // reseeded the buffer with simulated history, so we wipe it
      // before un-pausing — otherwise the user would see fake logs
      // intermixed with the real device's output.
      resetIngest();
      hubRef.current.reset([]);
      setDevice(d);
      setUsingFake(false);
      showToast(`Switched to ${d.model}`);
    },
    [connectFake, resetIngest, showToast],
  );

  // ---- Global keyboard shortcuts -----------------------------------------
  // Only the help dialog shortcut stays global — every per-widget shortcut
  // (Space / ⌘K / ⌘F / / / Esc) lives inside the widget so two Logcat
  // tiles don't toggle each other.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
      if (e.key === '?' && !inField) {
        e.preventDefault();
        setHelpOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Memoise the chrome context value so widgets don't re-render on
  // unrelated App state changes.
  const chrome = useMemo(
    () => ({ tweaks, setTweaks, showToast, performanceModeOn }),
    [tweaks, setTweaks, showToast, performanceModeOn],
  );

  if (!device) {
    return (
      <>
        <EmptyState
          onConnect={connectReal}
          onUseFakeData={connectFake}
          onConnectWdp={connectWdp}
        />
        {toast && <div className="toast">{toast}</div>}
      </>
    );
  }

  return (
    <AdbProvider device={device} adb={adb} stream={realStreamRef.current} usingFake={usingFake}>
      <LogStreamContext.Provider value={hubRef.current}>
        <DashboardChromeContext.Provider value={chrome}>
          <Dashboard
            device={device}
            devices={devices.length ? devices : [device]}
            usingFake={usingFake}
            tweaks={tweaks}
            setTweaks={setTweaks}
            onSwitchDevice={switchDevice}
            onDisconnect={onDisconnect}
            onPairNew={onPairNew}
          />
          <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
          {usingFake && (
            <div className="fake-badge">
              <Icons.Sparkle size={12} /> Simulated log stream
            </div>
          )}
          {toast && <div className="toast">{toast}</div>}
        </DashboardChromeContext.Provider>
      </LogStreamContext.Provider>
    </AdbProvider>
  );
}

