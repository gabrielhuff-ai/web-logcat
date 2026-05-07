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
  type PointerEvent as ReactPointerEvent,
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
import type { ScrcpySession } from '../../lib/scrcpy';
import { AndroidMotionEventAction } from '@yume-chan/scrcpy';
import type { AndroidKeyCode } from '@yume-chan/scrcpy';

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

  // ---- Refs (canvas, session, decoder) ---------------------------------
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sessionRef = useRef<ScrcpySession | null>(null);
  const decoderDisposeRef = useRef<(() => void) | null>(null);
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
        const session = await startScrcpy(
          adb,
          perfRef.current
            ? { maxFps: 30, bitRate: 4_000_000 }
            : {},
        );
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
  }, [adb, usingFake, showToast]);

  // ---- Pointer drag → MOTION_DOWN / MOVE / UP --------------------------
  // The previous version only emitted DOWN+UP back to back, so the
  // device only ever saw single taps — scroll, swipe, long-press all
  // resolved to a no-op tap on the centre of whatever the user touched.
  // Pointer events let us forward MOVE deltas while the pointer is
  // pressed, so dragging a finger across the screen surface produces
  // a real fling on the device.
  const dragRef = useRef<{ pointerId: bigint; lastX: number; lastY: number } | null>(null);

  const screenFrac = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      fracX: (e.clientX - rect.left) / rect.width,
      fracY: (e.clientY - rect.top) / rect.height,
    };
  }, []);

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
        setTaps((prev) => [...prev, { id, x: fracX * 360, y: fracY * 760, r: 8, op: 0.9 }]);
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

    try {
      const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
      const muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: {
          codec: 'avc',
          width: session.metadata.width,
          height: session.metadata.height,
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

      const unsubscribe = session.subscribeRaw((chunk) => {
        if (cancelled) return;
        const now = performance.now() * 1000; // microseconds
        if (firstTs == null) firstTs = now;
        const ts = Math.round(now - firstTs);
        // Heuristic key-frame detection on the AnnexB stream: scrcpy
        // produces NAL-unit boundaries at 0x00000001; type 5 (IDR)
        // signals a keyframe in H.264. mp4-muxer is forgiving here —
        // any non-keyframe before the first IDR is dropped.
        const isKey = isAnnexBKeyframe(chunk);
        // 16ms ≈ 60fps; the muxer just needs a non-zero duration so
        // the produced .mp4 timestamps stay strictly monotonic.
        muxer.addVideoChunkRaw(chunk, isKey ? 'key' : 'delta', ts, 16_000);
      });

      recorderRef.current = {
        async stop() {
          cancelled = true;
          unsubscribe();
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
    <div className="mr-widget" data-tile-id={tileId} style={widgetStyle}>
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

      <div
        className="mr-screen"
        onPointerDown={onScreenPointerDown}
        onPointerMove={onScreenPointerMove}
        onPointerUp={onScreenPointerUp}
        onPointerCancel={onScreenPointerUp}
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
