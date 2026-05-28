// Mirror widget — scrcpy-style live device screen (HANDOFF §5).
//
// Two render paths, switched on `useAdb().usingFake`:
//
//   - Real device → start a scrcpy session via `lib/scrcpy.ts` and pipe
//     H.264 NALs into the WebCodecs decoder, which paints a `<canvas>`
//     positioned inside the SVG bezel. Tap injection, hardware buttons,
//     screenshot, and recording all hit the live control channel /
//     decoded VideoFrame.
//
//   - Simulator → render the canned shopping-app SVG
//     (`mirror/MirrorAppFrame.tsx`). Tap injection becomes a tap-ripple
//     animation. Buttons toast "Simulated mode — button ignored" and
//     Record / Screenshot toast "Simulated mode — recording disabled".
//
// The canvas + decoder live OUTSIDE React's render tree (refs only) so
// we don't blow ~60 frames/sec of work through reconciliation. Only the
// toolbar + REC pill rerender when state changes.
//
// Bezel + toolbar styling lives in `src/styles/widgets/mirror.css`
// (verbatim from `design/v2/source/widget-mirror.jsx`'s inline `<style>`
// block) and is imported at the top of this file so it co-loads with
// the lazy chunk.

import '../../styles/widgets/mirror.css';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import type { CSSProperties } from 'react';
import * as Icons from '../Icons';
import { useAdb } from '../../lib/adbContext';
import { useDashboardChrome } from '../../lib/dashboardChrome';
import { useTileSettings } from '../../lib/tileSettings';
import { MIRROR_DEFAULTS, type MirrorSettings } from './mirror/mirrorSettings';
import {
  formatRecordTime,
  formatStatusClock,
  stepTaps,
  type SimTap,
} from '../../lib/scrcpySim';
import { MirrorAppFrame } from './mirror/MirrorAppFrame';
import { contentFrac } from './mirror/letterbox';
import { META_CTRL, resolveTextEditKey } from './mirror/keyMap';
import { createSync, type SyncFs, type WriteProgress } from '../../lib/sync';
import { WritableStream as ChanWritableStream } from '@yume-chan/stream-extra';
import {
  markInternalDropConsumed,
  markOpenOnDeviceRequested,
} from '../../lib/dragHandoff';
import type { ScrcpySession } from '../../lib/scrcpy';
import { AndroidMotionEventAction } from '@yume-chan/scrcpy';
import type { AndroidKeyCode, AndroidKeyEventMeta } from '@yume-chan/scrcpy';

export interface MirrorWidgetProps {
  /** Stable id of the host tile — used to namespace per-instance state. */
  tileId: string;
}

// Android keycode constants, matching scrcpy's `AndroidKeyCode` enum.
// We type them as `AndroidKeyCode` (a tight numeric union) so the
// writer's `injectKeyCode` accepts them without further casts.
const KEYCODE_HOME = 3 as AndroidKeyCode;
const KEYCODE_BACK = 4 as AndroidKeyCode;
const KEYCODE_VOLUME_UP = 24 as AndroidKeyCode;
const KEYCODE_VOLUME_DOWN = 25 as AndroidKeyCode;
const KEYCODE_POWER = 26 as AndroidKeyCode;
const KEYCODE_APP_SWITCH = 187 as AndroidKeyCode;
const KEYCODE_DEL = 67 as AndroidKeyCode;
const KEYCODE_ENTER = 66 as AndroidKeyCode;
const KEYCODE_TAB = 61 as AndroidKeyCode;
const KEYCODE_DPAD_UP = 19 as AndroidKeyCode;
const KEYCODE_DPAD_DOWN = 20 as AndroidKeyCode;
const KEYCODE_DPAD_LEFT = 21 as AndroidKeyCode;
const KEYCODE_DPAD_RIGHT = 22 as AndroidKeyCode;
const KEYCODE_ESCAPE = 111 as AndroidKeyCode;
const KEYCODE_FORWARD_DEL = 112 as AndroidKeyCode;
const KEYCODE_C = 31 as AndroidKeyCode;

/** Aspect ratio of the simulated home-screen frame (matches its SVG viewBox). */
const SIM_FRAME_W = 360;
const SIM_FRAME_H = 760;

/** Android `KeyEvent` action codes. */
const ACTION_DOWN = 0;
const ACTION_UP = 1;

/** Android `MotionEvent` action codes used for touch injection. */
const MOTION_DOWN = AndroidMotionEventAction.Down;
const MOTION_UP = AndroidMotionEventAction.Up;
const MOTION_MOVE = AndroidMotionEventAction.Move;

/** scrcpy `setScreenPowerMode` modes. */
const POWER_MODE_OFF = 0;
const POWER_MODE_NORMAL = 2;

/** Phases of a host-file drop's progress strip (used by `MirrorXferStrip`). */
interface MirrorXfer {
  name: string;
  phase: 'uploading' | 'installing' | 'done' | 'error';
  bytes: number;
  total: number | null;
}

// DataTransfer sniffers — declared at module scope so the drag/drop
// useCallbacks below don't have to list them in their deps.
const isDevicePathDrag = (e: ReactDragEvent<HTMLElement>): boolean =>
  e.dataTransfer.types.includes('application/x-weblogcat-device-path');
const isHostFilesDrag = (e: ReactDragEvent<HTMLElement>): boolean =>
  e.dataTransfer.types.includes('Files');
const isOpenableDrag = (e: ReactDragEvent<HTMLElement>): boolean =>
  isDevicePathDrag(e) || isHostFilesDrag(e);

export function MirrorWidget({ tileId }: MirrorWidgetProps) {
  const { device, adb, usingFake } = useAdb();
  const { showToast, performanceModeOn } = useDashboardChrome();
  // Stash perf mode in a ref so the session-init effect can read the
  // current value without restarting the scrcpy server every time the
  // user flips the toggle. The clamp is applied at session start; toggling
  // mid-session is a no-op until the widget re-mounts.
  const perfRef = useRef(performanceModeOn);
  useEffect(() => {
    perfRef.current = performanceModeOn;
  }, [performanceModeOn]);
  const [settings] = useTileSettings<MirrorSettings>(tileId, 'mirror', MIRROR_DEFAULTS);

  // ---- Toolbar / pill state (rerenders when changed) -------------------
  const [recording, setRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [time, setTime] = useState(() => formatStatusClock(new Date()));
  const [taps, setTaps] = useState<SimTap[]>([]);
  // Connection state for the real-mode path. The session is set up
  // outside React (in a ref) so the canvas keeps its identity across
  // toolbar rerenders; this state is just for displaying status.
  const [connState, setConnState] = useState<'idle' | 'connecting' | 'live' | 'error' | 'unsupported'>(
    'idle',
  );
  const [connErr, setConnErr] = useState<string | null>(null);
  // Toggling the device screen-power-mode without restarting the
  // session.
  const [screenOff, setScreenOff] = useState(false);

  // ---- Drop-to-open state ----------------------------------------------
  // Tracks whether a Files-widget file is being dragged over the
  // mirror — used to paint the "drop to open on device" overlay and to
  // gate which paths take the drop. Cleared on drop / dragleave.
  const [dropping, setDropping] = useState(false);
  // Progress strip below the toolbar while a host-file drop is in
  // flight. The strip mirrors the Files widget's `.fx-xfer` pill: a
  // determinate bar during the push phase + an indeterminate slide
  // during the (no-progress-signal) `pm install` phase.
  const [xfer, setXfer] = useState<MirrorXfer | null>(null);
  const clearXferTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (clearXferTimerRef.current != null) {
        window.clearTimeout(clearXferTimerRef.current);
      }
    };
  }, []);
  // Lazy SyncFs handle for the install-on-drop action. Created on first
  // drop and disposed on unmount. Reusing the Files widget's instance
  // would force a coupling between widgets; one-per-widget keeps each
  // tile self-contained, and the underlying socket is opened lazily by
  // `createSync` so the cost is only paid when the user actually drops.
  const fsRef = useRef<SyncFs | null>(null);
  if (fsRef.current === null) {
    fsRef.current = createSync(usingFake ? null : adb);
  }
  useEffect(() => {
    return () => {
      void fsRef.current?.dispose();
      fsRef.current = null;
    };
  }, []);

  // ---- Refs (canvas, session, decoder) ---------------------------------
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sessionRef = useRef<ScrcpySession | null>(null);
  const decoderDisposeRef = useRef<(() => void) | null>(null);
  // Latest device-side clipboard contents, kept in a ref so Ctrl/Cmd+C
  // on the mirror can write to `navigator.clipboard` without rerendering
  // the toolbar on every device clipboard update.
  const deviceClipboardRef = useRef<string | null>(null);
  // One-shot resolvers waiting for the *next* device-clipboard emit.
  // `copyToHost` forwards Ctrl+C to the device and parks on this set
  // so the resulting clipboard contents land in `navigator.clipboard`
  // even when the device hadn't put anything on its clipboard yet.
  const clipboardWaitersRef = useRef<Set<(text: string) => void>>(new Set());
  // Monotonic sequence for `setClipboard` ACKs — scrcpy uses it to
  // match the SET_CLIPBOARD reply back to the request. We don't await
  // the ack (the writer's `setClipboard` already does that), but the
  // sequence must be unique per session.
  const clipboardSeqRef = useRef(1n);
  // Recorded chunks — populated while `recording === true`. We use the
  // mp4 muxer rather than encoding-from-scratch so the on-disk file is
  // browser-playable.
  const recorderRef = useRef<{ stop: () => Promise<Blob | null>; cancel: () => void } | null>(null);
  // Most-recent decoded frame, kept around for screenshot capture.
  const lastFrameRef = useRef<VideoFrame | null>(null);
  // Source dimensions reported by scrcpy (device pixels). Used to
  // scale tap coordinates.
  const srcSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const tapIdRef = useRef(0);

  // ---- Live status-bar clock (sim only) --------------------------------
  // Real devices paint the clock themselves; the sim SVG depends on
  // this state for its top-left text label.
  useEffect(() => {
    if (!usingFake) return;
    const id = window.setInterval(() => setTime(formatStatusClock(new Date())), 1500);
    return () => window.clearInterval(id);
  }, [usingFake]);

  // ---- Recording timer -------------------------------------------------
  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => setRecordTime((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [recording]);

  // ---- Tap-ripple decay (sim only — real mode skips this loop) ---------
  useEffect(() => {
    if (taps.length === 0) return;
    const id = window.setInterval(() => setTaps((prev) => stepTaps(prev)), 30);
    return () => window.clearInterval(id);
  }, [taps.length]);

  // ---- Real scrcpy session lifecycle -----------------------------------
  // One session per widget instance, tied to the live `adb` handle.
  // We dynamically import the heavy modules so the rest of the app
  // doesn't pay their bundle cost when no Mirror tile is open.
  useEffect(() => {
    if (usingFake || !adb) return;

    if (typeof window === 'undefined' || !('VideoDecoder' in window)) {
      setConnState('unsupported');
      return;
    }

    let cancelled = false;
    let cleanup: (() => Promise<void>) | null = null;

    (async () => {
      try {
        setConnState('connecting');
        setConnErr(null);

        const [{ startScrcpy }, decoderMod] = await Promise.all([
          import('../../lib/scrcpy'),
          import('@yume-chan/scrcpy-decoder-webcodecs'),
        ]);
        if (cancelled) return;

        // Performance mode caps scrcpy at 30 fps + 4 Mb/s — both
        // delivered by the scrcpy server itself, so the WebCodecs
        // decoder never sees the full firehose. Untouched in normal
        // mode (0 fps cap = scrcpy default of "encoder native rate").
        // Web Device Proxy doesn't expose `adb reverse`, so scrcpy has
        // to use forward-tunnel mode (opens the localabstract socket as
        // a regular ADB service instead of binding a host port). WebUSB
        // keeps the upstream default.
        const tunnelForward = device?.transport === 'proxy';
        const session = await startScrcpy(adb, {
          tunnelForward,
          ...(perfRef.current ? { maxFps: 30, bitRate: 4_000_000 } : {}),
        });
        if (cancelled) {
          await session.dispose();
          return;
        }
        sessionRef.current = session;

        const canvas = canvasRef.current;
        if (!canvas) {
          await session.dispose();
          return;
        }

        // Codec id from scrcpy → WebCodecs decoder codec.
        const renderer = new decoderMod.BitmapVideoFrameRenderer(canvas);
        const decoder = new decoderMod.WebCodecsVideoDecoder({
          codec: session.metadata.codec,
          renderer,
        });
        decoderDisposeRef.current = () => decoder.dispose();

        // Track size changes from the decoder (rotations land here).
        const sizeOff = decoder.sizeChanged((size) => {
          srcSizeRef.current = { width: size.width, height: size.height };
        });
        // Initial size from metadata.
        if (session.metadata.width && session.metadata.height) {
          srcSizeRef.current = {
            width: session.metadata.width,
            height: session.metadata.height,
          };
        }

        // Pipe the typed packet stream into the decoder.
        void session.packets.pipeTo(decoder.writable).catch(() => {
          /* stream closed / aborted — ignored */
        });

        // Drain the device-clipboard stream into a ref so a subsequent
        // Ctrl/Cmd+C on the mirror writes the most recent value to
        // `navigator.clipboard`. scrcpy emits on every device clipboard
        // change while `clipboardAutosync` is on (the default), so we
        // get a "live" mirror of whatever the user has copied on the
        // device without polling.
        if (session.clipboard) {
          void session.clipboard
            .pipeTo(
              new ChanWritableStream<string>({
                write(text) {
                  deviceClipboardRef.current = text;
                  // Drain any pending Ctrl+C waiters with the fresh
                  // value. Each waiter is one-shot — `copyToHost`
                  // adds itself before forwarding Ctrl+C, and the
                  // listener cleans up after firing.
                  const waiters = clipboardWaitersRef.current;
                  if (waiters.size > 0) {
                    const snap = [...waiters];
                    waiters.clear();
                    for (const fn of snap) {
                      try {
                        fn(text);
                      } catch {
                        /* one bad waiter shouldn't tear the stream */
                      }
                    }
                  }
                },
              }),
            )
            .catch(() => {
              /* stream closed — ignored */
            });
        }

        setConnState('live');

        cleanup = async () => {
          sizeOff();
          decoderDisposeRef.current = null;
          try {
            decoder.dispose();
          } catch {
            /* ignore */
          }
          await session.dispose();
        };
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Failed to start scrcpy';
        setConnState('error');
        setConnErr(msg);
        showToast(msg);
      }
    })();

    return () => {
      cancelled = true;
      void cleanup?.();
      sessionRef.current = null;
    };
  }, [adb, usingFake, showToast, device?.transport]);

  // ---- Pointer drag → MOTION_DOWN / MOVE / UP --------------------------
  // The previous version only emitted DOWN+UP back to back, so the
  // device only ever saw single taps — scroll, swipe, long-press all
  // resolved to a no-op tap on the centre of whatever the user touched.
  // Pointer events let us forward MOVE deltas while the pointer is
  // pressed, so dragging a finger across the screen surface produces
  // a real fling on the device.
  const dragRef = useRef<{ pointerId: bigint; lastX: number; lastY: number } | null>(null);

  // Map a pointer's client coords into [0..1] inside the *rendered video*
  // rectangle — not the `.mr-screen` container. The canvas / SVG inside
  // is letterboxed (`object-fit: contain` / `preserveAspectRatio="meet"`)
  // when its aspect ratio differs from the tile's, so using the
  // container rect directly stretches the tap mapping across the black
  // gutters and the cursor / actual gesture diverge. We resolve the
  // source aspect from `srcSizeRef` in real mode and the SVG viewBox
  // (360×760) in sim mode.
  const screenFrac = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const src = usingFake
        ? { width: SIM_FRAME_W, height: SIM_FRAME_H }
        : srcSizeRef.current;
      return contentFrac(rect, e.clientX, e.clientY, src.width, src.height);
    },
    [usingFake],
  );

  const injectMotion = useCallback(
    async (action: AndroidMotionEventAction, fracX: number, fracY: number) => {
      const ctrl = sessionRef.current?.control;
      const src = srcSizeRef.current;
      if (!ctrl || src.width === 0 || src.height === 0) return;
      const videoWidth = src.width;
      const videoHeight = src.height;
      const x = Math.round(fracX * videoWidth);
      const y = Math.round(fracY * videoHeight);
      // -2n = scrcpy's `Finger` PointerId, distinct from -1n (mouse).
      try {
        await ctrl.injectTouch({
          pointerId: -2n,
          pointerX: x,
          pointerY: y,
          videoWidth,
          videoHeight,
          actionButton: 0,
          buttons: 0,
          action,
          pressure: action === MOTION_UP ? 0 : 1,
        });
      } catch {
        /* control channel closed — ignored */
      }
    },
    [],
  );

  const onScreenPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const { fracX, fracY } = screenFrac(e);
      // Capture the pointer so we keep getting events even when the
      // cursor leaves the screen surface mid-swipe.
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = { pointerId: -2n, lastX: fracX, lastY: fracY };
      if (usingFake) {
        const id = ++tapIdRef.current;
        setTaps((prev) => [
          ...prev,
          { id, x: fracX * SIM_FRAME_W, y: fracY * SIM_FRAME_H, r: 8, op: 0.9 },
        ]);
        return;
      }
      void injectMotion(MOTION_DOWN, fracX, fracY);
    },
    [usingFake, screenFrac, injectMotion],
  );

  const onScreenPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      const { fracX, fracY } = screenFrac(e);
      dragRef.current.lastX = fracX;
      dragRef.current.lastY = fracY;
      if (usingFake) return;
      void injectMotion(MOTION_MOVE, fracX, fracY);
    },
    [usingFake, screenFrac, injectMotion],
  );

  const onScreenPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      const last = dragRef.current;
      dragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore — capture may already be released */
      }
      if (usingFake) return;
      void injectMotion(MOTION_UP, last.lastX, last.lastY);
    },
    [usingFake, injectMotion],
  );

  // ---- Clipboard helpers ------------------------------------------------
  // Ctrl/Cmd+V on the focused mirror pushes the host clipboard into the
  // device with `paste: true` so scrcpy immediately fires the paste in
  // the foreground app. Ctrl/Cmd+C writes the latest device-side
  // clipboard value (kept in sync via the scrcpy clipboard stream) back
  // to `navigator.clipboard`, so the user can pull a string they just
  // copied on the device into the host. Both require Clipboard API
  // permission, which the browser grants on user activation in a
  // focused page.
  const pasteFromHost = useCallback(async () => {
    if (usingFake) {
      showToast('Simulated mode — paste disabled');
      return;
    }
    const ctrl = sessionRef.current?.control;
    if (!ctrl) return;
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      showToast('Clipboard read blocked — grant clipboard permission');
      return;
    }
    if (!text) return;
    try {
      const sequence = clipboardSeqRef.current++;
      await ctrl.setClipboard({ sequence, paste: true, content: text });
    } catch {
      /* control channel closed — ignored */
    }
  }, [usingFake, showToast]);

  const copyToHost = useCallback(async () => {
    if (usingFake) {
      showToast('Simulated mode — copy disabled');
      return;
    }
    const ctrl = sessionRef.current?.control;
    if (!ctrl) return;

    // Park on the next clipboard emit *before* sending Ctrl+C, so a
    // device that responds quickly doesn't race past our listener.
    // The race resolves either way:
    //   - device produces a new clipboard value  → the writer above
    //     hands it to the waiter, we write to the host.
    //   - timeout fires first                   → fall back to the
    //     most-recent ref value (covers apps that handled Ctrl+C as
    //     a no-op but had something on the clipboard from earlier).
    const pendingUpdate = new Promise<string | null>((resolve) => {
      let settled = false;
      const finish = (val: string | null) => {
        if (settled) return;
        settled = true;
        clipboardWaitersRef.current.delete(waiter);
        window.clearTimeout(timer);
        resolve(val);
      };
      const waiter = (text: string) => finish(text);
      clipboardWaitersRef.current.add(waiter);
      const timer = window.setTimeout(() => finish(null), 400);
    });

    try {
      // Cast: scrcpy's `AndroidKeyEventMeta` is a tight numeric union
      // of *individual* bits, but the on-wire field accepts an OR'd
      // metaState. Both `META_SHIFT` and `META_CTRL` already include
      // their generic + side-specific bits per Android conventions
      // (`META_*_ON | META_*_LEFT_ON`).
      await ctrl.injectKeyCode({
        action: ACTION_DOWN,
        keyCode: KEYCODE_C,
        repeat: 0,
        metaState: META_CTRL as AndroidKeyEventMeta,
      });
      await ctrl.injectKeyCode({
        action: ACTION_UP,
        keyCode: KEYCODE_C,
        repeat: 0,
        metaState: META_CTRL as AndroidKeyEventMeta,
      });
    } catch {
      /* control channel closed — fall through to the fallback */
    }

    const fresh = await pendingUpdate;
    const text = fresh ?? deviceClipboardRef.current;
    if (!text) {
      showToast('Nothing to copy — select text on the device first');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      showToast('Clipboard write blocked — grant clipboard permission');
    }
  }, [usingFake, showToast]);

  // ---- Keyboard → scrcpy injectText / injectKeyCode --------------------
  // Forwards keys typed while `.mr-screen` has focus to the device.
  // Printable characters go through `injectText` (which routes via the
  // device's clipboard machinery); a small set of editor / nav keys map
  // to Android keycodes so backspace, arrows, enter etc. still feel
  // native inside text fields. Ctrl/Cmd+C / Ctrl/Cmd+V are intercepted
  // and routed to the host↔device clipboard bridge so the standard
  // copy / paste muscle memory works against the mirror. Other
  // modifier-laden shortcuts (Ctrl+Z, Cmd+E, …) are intentionally left
  // to the host browser and the dashboard.
  //
  // Stops native event propagation for every key we handle. Without
  // this, Backspace bubbles to the Dashboard's window-level keydown
  // listener, which removes the focused tile out from under the
  // user the moment they try to delete a character.
  const onScreenKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      const isMod = e.metaKey || e.ctrlKey;
      // Clipboard shortcuts — handled even in sim mode (the helpers
      // show an appropriate toast and bail) so the user gets feedback.
      if (isMod && !e.shiftKey && !e.altKey) {
        if (e.key === 'v' || e.key === 'V') {
          e.preventDefault();
          e.stopPropagation();
          e.nativeEvent.stopPropagation();
          void pasteFromHost();
          return;
        }
        if (e.key === 'c' || e.key === 'C') {
          e.preventDefault();
          e.stopPropagation();
          e.nativeEvent.stopPropagation();
          void copyToHost();
          return;
        }
      }

      // Sim mode forwards nothing to the device; let Backspace etc.
      // bubble so the dashboard's tile-delete shortcut still fires
      // (there's no real keystroke to compete with).
      if (usingFake) return;

      // Mac-style text-editing shortcuts (⌘+arrow / ⌥+arrow / ⇧+arrow,
      // with optional ⇧ for selection). Resolved into Android editor
      // keycodes via `keyMap.ts`; the resolver returns `null` when the
      // event isn't one we want to forward as an editor shortcut so
      // the existing specialMap below still owns plain Backspace /
      // Enter / Tab / unmodified-arrow handling.
      const edit = resolveTextEditKey(e);
      if (edit) {
        e.preventDefault();
        e.stopPropagation();
        e.nativeEvent.stopPropagation();
        const ctrl = sessionRef.current?.control;
        if (!ctrl) return;
        void (async () => {
          try {
            await ctrl.injectKeyCode({
              action: ACTION_DOWN,
              keyCode: edit.keyCode as AndroidKeyCode,
              repeat: 0,
              metaState: edit.metaState as AndroidKeyEventMeta,
            });
            await ctrl.injectKeyCode({
              action: ACTION_UP,
              keyCode: edit.keyCode as AndroidKeyCode,
              repeat: 0,
              metaState: edit.metaState as AndroidKeyEventMeta,
            });
          } catch {
            /* control channel closed — ignored */
          }
        })();
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const specialMap: Record<string, AndroidKeyCode> = {
        Backspace: KEYCODE_DEL,
        Delete: KEYCODE_FORWARD_DEL,
        Enter: KEYCODE_ENTER,
        Tab: KEYCODE_TAB,
        ArrowUp: KEYCODE_DPAD_UP,
        ArrowDown: KEYCODE_DPAD_DOWN,
        ArrowLeft: KEYCODE_DPAD_LEFT,
        ArrowRight: KEYCODE_DPAD_RIGHT,
        Escape: KEYCODE_ESCAPE,
      };
      const kc = specialMap[e.key];
      const isPrintable = e.key.length === 1;
      if (kc === undefined && !isPrintable) return;

      // Stop the native event from bubbling to the window-level
      // listener in `Dashboard.tsx`, which would otherwise treat
      // Backspace / Delete as "remove the focused tile" while the
      // user is just trying to delete a character on the device.
      // This runs whether the session is connected or not — we don't
      // want a connecting-state Backspace to nuke the tile either.
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopPropagation();

      const ctrl = sessionRef.current?.control;
      if (!ctrl) return;

      if (kc !== undefined) {
        void (async () => {
          try {
            await ctrl.injectKeyCode({ action: ACTION_DOWN, keyCode: kc, repeat: 0, metaState: 0 });
            await ctrl.injectKeyCode({ action: ACTION_UP, keyCode: kc, repeat: 0, metaState: 0 });
          } catch {
            /* control channel closed — ignored */
          }
        })();
        return;
      }
      // Single printable character (including Space). `e.key` for
      // composed input is the resulting text, which is exactly what
      // `injectText` expects.
      void ctrl.injectText(e.key).catch(() => {
        /* control channel closed — ignored */
      });
    },
    [usingFake, pasteFromHost, copyToHost],
  );

  // ---- Wheel / two-finger scroll → scrcpy injectScroll ------------------
  // Forwards mouse-wheel + trackpad scroll deltas to the device as
  // `INJECT_SCROLL` control messages. scrcpy expects scroll values in
  // wheel ticks (signed floats; positive scrollY = scroll DOWN); the
  // browser's `WheelEvent` reports pixel deltas in `deltaY` (default
  // mode) so we divide by `WHEEL_PX_PER_TICK` to convert. The
  // `preventDefault()` keeps the host page from also scrolling, which
  // is essential when the mirror tile is inside a scroll container.
  const WHEEL_PX_PER_TICK = 100;
  const onScreenWheel = useCallback(
    (e: ReactWheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (usingFake) return;
      const ctrl = sessionRef.current?.control;
      const src = srcSizeRef.current;
      if (!ctrl || src.width === 0 || src.height === 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      // Letterbox-aware mapping — see `screenFrac` above for the why.
      const { fracX, fracY } = contentFrac(
        rect,
        e.clientX,
        e.clientY,
        src.width,
        src.height,
      );
      const x = Math.round(fracX * src.width);
      const y = Math.round(fracY * src.height);
      // Negate Y because Android scroll convention is "scroll UP →
      // content moves DOWN" (positive scrollY) which is the inverse of
      // the wheel `deltaY` (positive = scroll DOWN).
      const scrollX = -e.deltaX / WHEEL_PX_PER_TICK;
      const scrollY = -e.deltaY / WHEEL_PX_PER_TICK;
      void ctrl
        .injectScroll({
          pointerX: x,
          pointerY: y,
          videoWidth: src.width,
          videoHeight: src.height,
          scrollX,
          scrollY,
          buttons: 0,
        })
        .catch(() => {
          /* control channel closed — ignored */
        });
    },
    [usingFake],
  );

  // ---- Hardware-button helpers -----------------------------------------
  const sendKey = useCallback(
    async (keyCode: AndroidKeyCode, label: string) => {
      if (usingFake) {
        showToast(`Simulated mode — ${label} ignored`);
        return;
      }
      const ctrl = sessionRef.current?.control;
      if (!ctrl) return;
      try {
        await ctrl.injectKeyCode({ action: ACTION_DOWN, keyCode, repeat: 0, metaState: 0 });
        await ctrl.injectKeyCode({ action: ACTION_UP, keyCode, repeat: 0, metaState: 0 });
      } catch {
        /* ignore */
      }
    },
    [usingFake, showToast],
  );

  // Power additionally toggles the device-side screen power state so
  // the device screen stays off when the user wants only the mirror.
  const togglePower = useCallback(async () => {
    if (usingFake) {
      showToast('Simulated mode — Power ignored');
      return;
    }
    const ctrl = sessionRef.current?.control;
    if (!ctrl) return;
    try {
      await ctrl.injectKeyCode({ action: ACTION_DOWN, keyCode: KEYCODE_POWER, repeat: 0, metaState: 0 });
      await ctrl.injectKeyCode({ action: ACTION_UP, keyCode: KEYCODE_POWER, repeat: 0, metaState: 0 });
      const next = !screenOff;
      await ctrl.setScreenPowerMode(next ? POWER_MODE_OFF : POWER_MODE_NORMAL);
      setScreenOff(next);
    } catch {
      /* ignore */
    }
  }, [usingFake, showToast, screenOff]);

  // ---- Recording -------------------------------------------------------
  const startRecording = useCallback(async () => {
    if (usingFake) {
      showToast('Simulated mode — recording disabled');
      return;
    }
    const session = sessionRef.current;
    if (!session) return;
    if (!session.metadata.width || !session.metadata.height) {
      showToast('Recording unavailable: missing video metadata');
      return;
    }
    const codedWidth = session.metadata.width;
    const codedHeight = session.metadata.height;

    try {
      const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
      const muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: {
          codec: 'avc',
          width: codedWidth,
          height: codedHeight,
        },
        fastStart: 'in-memory',
        firstTimestampBehavior: 'offset',
      });

      // Subscribe to raw NAL bytes via the session's fan-out callback
      // (see `lib/scrcpy.ts`). The session keeps the upstream stream
      // tee'd + actively drained, so we can come and go without ever
      // touching `getReader` (which previously raced with the tee's
      // pipe-through and produced "stream is locked to a reader").
      let cancelled = false;
      let firstTs: number | null = null;
      // Capture SPS/PPS from the first chunks so we can build the
      // AVCDecoderConfigurationRecord that mp4-muxer needs at finalize
      // time. Without it the muxer dereferences a null `decoderConfig`
      // and throws "Cannot read properties of null (reading 'colorSpace')".
      let sps: Uint8Array | null = null;
      let pps: Uint8Array | null = null;
      let configWritten = false;

      const unsubscribe = session.subscribeRaw((chunk) => {
        if (cancelled) return;
        // Walk the NAL list once: capture SPS/PPS for the decoder
        // config and decide whether this chunk is config-only (no
        // slice NALs). Config-only chunks must be skipped — feeding
        // them to mp4-muxer as samples produces an unplayable file
        // because the muxer treats them as frames.
        let hasSlice = false;
        for (const nal of findNalUnits(chunk)) {
          if (nal.type === 1 || nal.type === 5) hasSlice = true;
          if (nal.type === 7 && !sps) sps = new Uint8Array(nal.payload);
          else if (nal.type === 8 && !pps) pps = new Uint8Array(nal.payload);
        }
        if (!hasSlice) return;

        const now = performance.now() * 1000; // microseconds
        if (firstTs == null) firstTs = now;
        const ts = Math.round(now - firstTs);
        // NAL type 5 (IDR) signals a keyframe in H.264. mp4-muxer is
        // forgiving here — any non-keyframe before the first IDR is
        // dropped.
        const isKey = isAnnexBKeyframe(chunk);

        let meta: { decoderConfig: { codec: string; description: ArrayBuffer; codedWidth: number; codedHeight: number } } | undefined;
        if (!configWritten && sps && pps) {
          const cfg = buildAVCDecoderConfig(sps, pps);
          meta = {
            decoderConfig: {
              codec: cfg.codec,
              description: cfg.description.buffer.slice(
                cfg.description.byteOffset,
                cfg.description.byteOffset + cfg.description.byteLength,
              ) as ArrayBuffer,
              codedWidth,
              codedHeight,
            },
          };
          configWritten = true;
        }

        // MP4 stores AVC samples in AVCC (length-prefixed) form, not
        // AnnexB (start codes). Without this conversion the resulting
        // file plays at the right duration / aspect but the contents
        // are completely black because the demuxer can't find sample
        // boundaries. 16ms ≈ 60fps; the muxer just needs a non-zero
        // duration so timestamps stay strictly monotonic.
        const avccChunk = annexbToAvcc(chunk);
        muxer.addVideoChunkRaw(avccChunk, isKey ? 'key' : 'delta', ts, 16_000, meta);
      });

      recorderRef.current = {
        async stop() {
          cancelled = true;
          unsubscribe();
          if (!configWritten) {
            // Recording stopped before the H.264 stream produced an
            // SPS+PPS pair (typical for sub-IDR-interval recordings).
            // Finalising now would crash inside mp4-muxer because the
            // track has no decoderConfig; surface a friendlier error
            // instead.
            throw new Error('Recording too short — try again after the first keyframe');
          }
          muxer.finalize();
          const target = muxer.target as { buffer: ArrayBuffer };
          return new Blob([target.buffer], { type: 'video/mp4' });
        },
        cancel() {
          cancelled = true;
          unsubscribe();
        },
      };
      setRecordTime(0);
      setRecording(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start recording';
      showToast(msg);
    }
  }, [usingFake, showToast]);

  const stopRecording = useCallback(async () => {
    const rec = recorderRef.current;
    recorderRef.current = null;
    setRecording(false);
    if (!rec) return;
    try {
      const blob = await rec.stop();
      if (!blob) return;
      const ts = Date.now();
      const fname = `weblogcat-mirror-${device?.serial ?? 'unknown'}-${ts}.mp4`;
      triggerDownload(blob, fname);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to finalise recording';
      showToast(msg);
    }
  }, [device, showToast]);

  const toggleRecording = useCallback(() => {
    if (recording) void stopRecording();
    else void startRecording();
  }, [recording, startRecording, stopRecording]);

  // ---- Screenshot ------------------------------------------------------
  const takeScreenshot = useCallback(async () => {
    if (usingFake) {
      showToast('Simulated mode — Screenshot disabled');
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Use a 2D copy of the WebCodecs canvas — the canvas the decoder
    // paints into may be a Bitmap renderer (no `toBlob` on its
    // backing OffscreenCanvas semantics in older Chromium).
    const tmp = document.createElement('canvas');
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    const ctx = tmp.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(canvas, 0, 0);
    tmp.toBlob((blob) => {
      if (!blob) return;
      const ts = Date.now();
      const fname = `weblogcat-mirror-${device?.serial ?? 'unknown'}-${ts}.png`;
      triggerDownload(blob, fname);
    }, 'image/png');
  }, [usingFake, device, showToast]);

  // ---- Track most-recent VideoFrame for screenshot via decoder snapshot
  // Currently we read directly off the canvas; the snapshot path stays
  // commented as a hint for the latency / fidelity follow-up.
  useEffect(() => {
    return () => {
      const f = lastFrameRef.current;
      if (f) {
        try {
          f.close();
        } catch {
          /* ignore */
        }
      }
      lastFrameRef.current = null;
    };
  }, []);

  // ---- Drag-and-drop "open on device" ----------------------------------
  // Two drag sources land here:
  //   1. A file row from the Files widget — carries the
  //      `application/x-weblogcat-device-path` MIME (set in
  //      FilesWidget's `onRowDragStart`). The path already lives on
  //      the device; we just call `SyncFs.open`.
  //   2. A file from the host OS (Finder / Explorer / browser
  //      download) — carries the standard `Files` MIME. We push it to
  //      `/sdcard/Download/<name>` first, then call `open` on the
  //      resulting device path. APKs install via `pm install`; other
  //      files fire an `am start VIEW` intent.
  // In the device-path case we also mark the drag consumed so the
  // Files widget skips its default Pull-to-host download.
  const onMirrorDragOver = useCallback((e: ReactDragEvent<HTMLDivElement>) => {
    if (!isOpenableDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropping(true);
  }, []);
  const onMirrorDragLeave = useCallback((e: ReactDragEvent<HTMLDivElement>) => {
    // Only clear when the pointer truly left the widget, not when it
    // crossed into a descendant.
    if (e.currentTarget === e.target) setDropping(false);
  }, []);
  // Schedule the progress strip to fade away after a short success
  // window so the user has visible confirmation the operation
  // finished, without the strip sticking around forever.
  const scheduleXferFade = useCallback((delayMs: number) => {
    if (clearXferTimerRef.current != null) {
      window.clearTimeout(clearXferTimerRef.current);
    }
    clearXferTimerRef.current = window.setTimeout(() => {
      setXfer(null);
      clearXferTimerRef.current = null;
    }, delayMs);
  }, []);

  const openDevicePath = useCallback(
    async (devicePath: string) => {
      const fs = fsRef.current;
      if (!fs) return;
      const slash = devicePath.lastIndexOf('/');
      const name = slash >= 0 ? devicePath.slice(slash + 1) : devicePath;
      const isApk = devicePath.toLowerCase().endsWith('.apk');
      // Show the indeterminate "installing" strip while `pm install`
      // runs (typically 5–30 s on real devices). Non-APK opens fire
      // `am start VIEW` and return almost instantly, so we don't
      // bother lighting up the strip for those.
      if (isApk) {
        if (clearXferTimerRef.current != null) {
          window.clearTimeout(clearXferTimerRef.current);
          clearXferTimerRef.current = null;
        }
        setXfer({ name, phase: 'installing', bytes: 0, total: null });
      }
      const res = await fs.open(devicePath);
      if (res.ok) {
        if (isApk) {
          setXfer({ name, phase: 'done', bytes: 0, total: null });
          scheduleXferFade(1500);
        }
        showToast(isApk ? `Installed ${name}` : `Opened ${name} on device`);
      } else {
        if (isApk) {
          setXfer({ name, phase: 'error', bytes: 0, total: null });
          scheduleXferFade(2500);
        }
        console.error(`[Mirror] open failed for ${devicePath}:`, res.reason);
        showToast(isApk ? `Install failed for ${name}` : `Open failed for ${name}`);
      }
    },
    [showToast, scheduleXferFade],
  );
  const uploadAndOpen = useCallback(
    async (file: File) => {
      const fs = fsRef.current;
      if (!fs) return;
      // Stage in `/sdcard/Download` — world-readable on every Android
      // version since 4.0, so both `pm install` and `am start VIEW`
      // can pick it up without SELinux fights. The Files widget's
      // existing push pipeline does the same.
      const target = `/sdcard/Download/${file.name}`;
      if (clearXferTimerRef.current != null) {
        window.clearTimeout(clearXferTimerRef.current);
        clearXferTimerRef.current = null;
      }
      setXfer({ name: file.name, phase: 'uploading', bytes: 0, total: file.size });
      try {
        await fs.write(target, file.stream(), {
          total: file.size,
          onProgress: (p: WriteProgress) => {
            setXfer((cur) =>
              cur && cur.name === file.name && cur.phase === 'uploading'
                ? { ...cur, bytes: p.bytes, total: p.total }
                : cur,
            );
          },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Push failed';
        setXfer({ name: file.name, phase: 'error', bytes: 0, total: null });
        scheduleXferFade(2500);
        showToast(`Upload failed for ${file.name}: ${msg}`);
        return;
      }
      await openDevicePath(target);
    },
    [openDevicePath, showToast, scheduleXferFade],
  );
  const onMirrorDrop = useCallback(
    (e: ReactDragEvent<HTMLDivElement>) => {
      if (!isOpenableDrag(e)) return;
      e.preventDefault();
      setDropping(false);
      if (usingFake) {
        markInternalDropConsumed();
        showToast('Simulated mode — open on device disabled');
        return;
      }
      // In-app device-path drag (from Files): defer back to the
      // source Files widget so the install progress strip lives on
      // *that* widget — same surface the user already sees when
      // double-clicking a row. We just mark the handoff and let the
      // Files widget's `onRowDragEnd` fire `openOnDevice` for the
      // entry. We deliberately do *not* call `fs.open` here so the
      // two install strips never race.
      if (isDevicePathDrag(e)) {
        markOpenOnDeviceRequested();
        return;
      }
      // Host-file drag (from Finder / Explorer / browser): push to
      // device, then open. Serial uploads — concurrent pushes against
      // a single sync socket race for the writer lock. The progress
      // strip stays on Mirror in this case because there's no Files
      // widget instance owning the drag.
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;
      void (async () => {
        for (const f of files) {
          await uploadAndOpen(f);
        }
      })();
    },
    [usingFake, showToast, uploadAndOpen],
  );

  // ---- Render ---------------------------------------------------------
  const inlineNotice = useMemo(() => {
    if (usingFake) return null;
    if (connState === 'unsupported') {
      return 'Mirror requires Chromium 94+ with WebCodecs support.';
    }
    if (connState === 'error') {
      return connErr ?? 'Failed to start scrcpy session.';
    }
    if (connState === 'connecting') {
      return 'Starting scrcpy session…';
    }
    return null;
  }, [usingFake, connState, connErr]);

  const widgetStyle: CSSProperties = {
    ['--widget-font-size' as string]: `${settings.fontSize}px`,
  } as CSSProperties;

  return (
    <div
      className={`mr-widget ${dropping ? 'mr-dropping' : ''}`}
      data-tile-id={tileId}
      style={widgetStyle}
      onDragOver={onMirrorDragOver}
      onDragLeave={onMirrorDragLeave}
      onDrop={onMirrorDrop}
    >
      <div className="mr-toolbar widget-bar">
        <div className="mr-hwgroup">
          <button
            type="button"
            className="mr-hw"
            title="Back"
            aria-label="Back"
            onClick={() => void sendKey(KEYCODE_BACK, 'Back')}
          >
            <svg width="14" height="14" viewBox="0 0 16 16">
              <path
                d="M 11 3 L 5 8 L 11 13"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className="mr-hw"
            title="Home"
            aria-label="Home"
            onClick={() => void sendKey(KEYCODE_HOME, 'Home')}
          >
            <svg width="14" height="14" viewBox="0 0 16 16">
              <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </button>
          <button
            type="button"
            className="mr-hw"
            title="Menu"
            aria-label="Menu"
            onClick={() => void sendKey(KEYCODE_APP_SWITCH, 'Menu')}
          >
            <svg width="14" height="14" viewBox="0 0 16 16">
              <rect x="3" y="3" width="10" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </button>
        </div>
        <span className="mr-sep" />
        <div className="mr-hwgroup">
          <button
            type="button"
            className="mr-hw"
            title="Volume up"
            aria-label="Volume up"
            onClick={() => void sendKey(KEYCODE_VOLUME_UP, 'Volume up')}
          >
            <svg width="14" height="14" viewBox="0 0 16 16">
              <path d="M 4 6 L 4 10 L 7 10 L 11 13 L 11 3 L 7 6 Z" fill="currentColor" />
              <path d="M 13 6 Q 14.5 8 13 10" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          <button
            type="button"
            className="mr-hw"
            title="Volume down"
            aria-label="Volume down"
            onClick={() => void sendKey(KEYCODE_VOLUME_DOWN, 'Volume down')}
          >
            <svg width="14" height="14" viewBox="0 0 16 16">
              <path d="M 4 6 L 4 10 L 7 10 L 11 13 L 11 3 L 7 6 Z" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            className="mr-hw"
            title="Power"
            aria-label="Power"
            onClick={() => void togglePower()}
          >
            <svg width="14" height="14" viewBox="0 0 16 16">
              <path
                d="M 8 3 L 8 8 M 5 5 Q 3 7 3 9 a 5 5 0 0 0 10 0 Q 13 7 11 5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <span className="mr-sep" />
        <div className="mr-hwgroup">
          <button
            type="button"
            className={`mr-hw ${recording ? 'rec' : ''}`}
            title={recording ? 'Stop recording' : 'Record screen'}
            aria-label={recording ? 'Stop recording' : 'Record screen'}
            onClick={toggleRecording}
          >
            {recording ? <Icons.Stop size={12} /> : <Icons.Record size={12} />}
          </button>
          <button
            type="button"
            className="mr-hw"
            title="Screenshot"
            aria-label="Screenshot"
            onClick={() => void takeScreenshot()}
          >
            <Icons.Camera size={13} />
          </button>
        </div>
        <span style={{ flex: 1 }} />
      </div>

      {xfer && <MirrorXferStrip xfer={xfer} />}

      <div
        className="mr-screen"
        tabIndex={0}
        onPointerDown={(e) => {
          // Take keyboard focus on first tap so subsequent typing
          // forwards to the device. preventScroll keeps the dashboard
          // viewport from jumping when the screen is offscreen.
          e.currentTarget.focus({ preventScroll: true });
          onScreenPointerDown(e);
        }}
        onPointerMove={onScreenPointerMove}
        onPointerUp={onScreenPointerUp}
        onPointerCancel={onScreenPointerUp}
        onWheel={onScreenWheel}
        onKeyDown={onScreenKeyDown}
      >
        {usingFake ? (
          <MirrorAppFrame time={time} taps={taps} />
        ) : (
          <canvas ref={canvasRef} className="mirror-canvas" />
        )}
        {inlineNotice && <div className="mr-inline-notice">{inlineNotice}</div>}
        {recording && (
          <div className="mr-recording-pill">
            <span className="mr-rec-dot" />
            REC · {formatRecordTime(recordTime)}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The host-file-drop progress strip that paints below the Mirror's
 * toolbar. Three visual variants:
 *   - uploading → determinate bar driven by `bytes` / `total`
 *   - installing → indeterminate slide (no signal from `pm install`)
 *   - done / error → solid bar + checkmark / error icon
 * Styling mirrors the Files widget's `.fx-xfer` pill but lives under
 * `.mr-xfer` so the two widgets don't share global selectors.
 */
function MirrorXferStrip({ xfer }: { xfer: MirrorXfer }) {
  const pct =
    xfer.total != null && xfer.total > 0
      ? Math.min(100, Math.round((xfer.bytes / xfer.total) * 100))
      : null;
  const label =
    xfer.phase === 'uploading'
      ? `Uploading · ${xfer.name}`
      : xfer.phase === 'installing'
        ? `Installing · ${xfer.name}`
        : xfer.phase === 'error'
          ? `Failed · ${xfer.name}`
          : `Done · ${xfer.name}`;
  return (
    <div
      className={`mr-xfer mr-xfer-${xfer.phase}`}
      role="status"
      aria-live="polite"
    >
      <span className="mr-xfer-name">{label}</span>
      <div className="mr-xfer-bar">
        {xfer.phase === 'uploading' && pct != null ? (
          <div style={{ width: `${pct}%` }} />
        ) : xfer.phase === 'installing' ? (
          <div className="mr-xfer-indeterminate" />
        ) : (
          <div style={{ width: '100%' }} />
        )}
      </div>
      <span className="mr-xfer-pct">
        {xfer.phase === 'uploading' && pct != null
          ? `${pct}%`
          : xfer.phase === 'done'
            ? '✓'
            : xfer.phase === 'error'
              ? '!'
              : '…'}
      </span>
    </div>
  );
}

/** Trigger a Blob → file download via a one-shot anchor. */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke a tick later so the browser has a chance to start the
  // download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Walk an AnnexB byte buffer, splitting on start codes (`0x000001` or
 * `0x00000001`) and returning each NAL unit's type + payload (without
 * the start code). Used to pluck SPS / PPS out of the recorded stream.
 */
function findNalUnits(buf: Uint8Array): { type: number; payload: Uint8Array }[] {
  const out: { type: number; payload: Uint8Array }[] = [];
  let i = 0;
  while (i + 2 < buf.length) {
    let scLen = 0;
    if (
      i + 3 < buf.length &&
      buf[i] === 0 && buf[i + 1] === 0 && buf[i + 2] === 0 && buf[i + 3] === 1
    ) {
      scLen = 4;
    } else if (buf[i] === 0 && buf[i + 1] === 0 && buf[i + 2] === 1) {
      scLen = 3;
    } else {
      i++;
      continue;
    }
    const start = i + scLen;
    let end = buf.length;
    for (let j = start; j + 2 < buf.length; j++) {
      if (buf[j] === 0 && buf[j + 1] === 0) {
        if (buf[j + 2] === 1) { end = j; break; }
        if (buf[j + 2] === 0 && j + 3 < buf.length && buf[j + 3] === 1) { end = j; break; }
      }
    }
    if (end > start) {
      out.push({ type: buf[start] & 0x1f, payload: buf.subarray(start, end) });
    }
    i = end;
  }
  return out;
}

/**
 * Build an AVCDecoderConfigurationRecord (the `description` blob that
 * goes inside the MP4's `avcC` box) from a single SPS + PPS pair, plus
 * the matching `avc1.PPCCLL` codec string. mp4-muxer needs this on the
 * track's `decoderConfig` to produce a playable file.
 */
function buildAVCDecoderConfig(sps: Uint8Array, pps: Uint8Array): { codec: string; description: Uint8Array } {
  const profile = sps[1];
  const compat = sps[2];
  const level = sps[3];
  const desc = new Uint8Array(11 + sps.length + pps.length);
  let p = 0;
  desc[p++] = 1; // configurationVersion
  desc[p++] = profile;
  desc[p++] = compat;
  desc[p++] = level;
  desc[p++] = 0xff; // 0xFC | 3 — 4-byte NAL length prefix in AVCC samples
  desc[p++] = 0xe1; // 0xE0 | 1 SPS
  desc[p++] = (sps.length >> 8) & 0xff;
  desc[p++] = sps.length & 0xff;
  desc.set(sps, p); p += sps.length;
  desc[p++] = 0x01; // 1 PPS
  desc[p++] = (pps.length >> 8) & 0xff;
  desc[p++] = pps.length & 0xff;
  desc.set(pps, p);
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return { codec: `avc1.${hex(profile)}${hex(compat)}${hex(level)}`, description: desc };
}

/**
 * Convert an AnnexB byte stream to AVCC: replace each NAL's start
 * code (`0x000001` or `0x00000001`) with a 4-byte big-endian length
 * prefix. MP4 stores AVC samples in AVCC form; without this conversion
 * the resulting file plays at the right duration / aspect but the
 * picture is solid black because the demuxer can't find NAL
 * boundaries.
 */
function annexbToAvcc(buf: Uint8Array): Uint8Array {
  const nals = findNalUnits(buf);
  let total = 0;
  for (const n of nals) total += 4 + n.payload.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const n of nals) {
    const len = n.payload.length;
    out[p++] = (len >>> 24) & 0xff;
    out[p++] = (len >>> 16) & 0xff;
    out[p++] = (len >>> 8) & 0xff;
    out[p++] = len & 0xff;
    out.set(n.payload, p);
    p += len;
  }
  return out;
}

/**
 * Heuristic AnnexB keyframe detector: scan for a NAL start code
 * (`0x00 0x00 0x00 0x01` or `0x00 0x00 0x01`) and inspect the next
 * byte's `nal_unit_type`. Type 5 is `IDR_SLICE` in H.264; types 7/8
 * (SPS / PPS) imply an upcoming IDR so we treat them as keyframes too.
 *
 * Good enough for the mp4 muxer's "where do I start the GOP" question.
 */
function isAnnexBKeyframe(buf: Uint8Array): boolean {
  for (let i = 0; i + 4 < buf.length; i++) {
    if (buf[i] === 0 && buf[i + 1] === 0) {
      let off = -1;
      if (buf[i + 2] === 1) off = i + 3;
      else if (buf[i + 2] === 0 && buf[i + 3] === 1) off = i + 4;
      if (off > 0) {
        const nalType = buf[off] & 0x1f;
        if (nalType === 5 || nalType === 7 || nalType === 8) return true;
        // Skip past this NAL boundary so we don't keep finding the
        // same prefix.
        i = off;
      }
    }
  }
  return false;
}
