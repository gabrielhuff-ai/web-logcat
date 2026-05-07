// scrcpy session lib — push the vendored server jar, spawn it on the
// device via `app_process`, and expose typed handles for the video
// stream + control channel.
//
// Vendored binary lives at `public/scrcpy/scrcpy-server-v2.7.jar`. The
// jar is the unmodified release artefact from
// https://github.com/Genymobile/scrcpy/releases/tag/v2.7 (Apache-2.0;
// see `public/scrcpy/LICENSE` for attribution).
//
// Compatibility matrix (matters because scrcpy strictly checks the
// version string `app_process` is launched with against the jar):
//
//   - scrcpy server: 2.7
//   - @yume-chan/scrcpy: 2.3.x  → exposes `ScrcpyOptions2_7`
//   - @yume-chan/adb-scrcpy: 2.3.x  → exposes `AdbScrcpyOptions2_7` +
//                                     `AdbScrcpyClient.start(...)`
//
// Newer yume-chan releases keep the same options class names (the
// 2.x line currently imports up to scrcpy 3.3.3); if we ever bump the
// jar past 2.7 we just pick the matching options class.

import type { Adb } from '@yume-chan/adb';
import { AdbScrcpyClient, AdbScrcpyOptions2_7 } from '@yume-chan/adb-scrcpy';
import {
  DefaultServerPath,
  ScrcpyVideoCodecId,
  type ScrcpyControlMessageWriter,
  type ScrcpyMediaStreamPacket,
  type ScrcpyVideoStreamMetadata,
} from '@yume-chan/scrcpy';
import { ReadableStream } from '@yume-chan/stream-extra';

/** URL of the vendored jar relative to the deployed app root. */
export const SCRCPY_SERVER_URL = 'scrcpy/scrcpy-server-v2.7.jar';
/** scrcpy server version string — must match the jar exactly. */
export const SCRCPY_VERSION = '2.7';

/**
 * What the widget consumes after a successful `startScrcpy`.
 *
 *   - `metadata` — codec id + source dimensions reported by scrcpy.
 *   - `packets`  — typed `ScrcpyMediaStreamPacket`s ready for the
 *                  WebCodecs decoder's `writable`. The session
 *                  internally tees the upstream byte stream and drains
 *                  the second branch into a dispatch loop, so no extra
 *                  locking happens here.
 *   - `subscribeRaw(fn)` — register a listener for raw H.264 / H.265
 *                  NAL byte chunks. The mp4 muxer subscribes only
 *                  while recording. Subscribers are called in the
 *                  order they registered; returns an unsubscribe
 *                  function. Subscribing post-session-start is safe —
 *                  the dispatch loop runs whether or not anyone is
 *                  listening, so the tee never stalls.
 *   - `control`  — typed sender for tap / key / power / etc.
 *   - `dispose`  — kill the server process + close the transport.
 */
export type RawChunkListener = (chunk: Uint8Array) => void;
export interface ScrcpySession {
  metadata: ScrcpyVideoStreamMetadata;
  packets: ReadableStream<ScrcpyMediaStreamPacket>;
  subscribeRaw(listener: RawChunkListener): () => void;
  control: ScrcpyControlMessageWriter | undefined;
  dispose: () => Promise<void>;
}

/**
 * Push the jar to `/data/local/tmp/scrcpy-server.jar`, start the
 * server, and resolve once the video / control streams are ready.
 *
 * `bitRate` is in bits per second; the scrcpy default is 8 Mb/s. We
 * keep it as a parameter so the widget can drop to 4 Mb/s if WebUSB
 * latency goes south, without changing this lib's API.
 */
export async function startScrcpy(
  adb: Adb,
  opts: { bitRate?: number; maxFps?: number } = {},
): Promise<ScrcpySession> {
  // 1. Fetch the vendored jar from the static asset path. `fetch` is
  //    fine here — Vite serves `public/` at the deploy root.
  const res = await fetch(import.meta.env.BASE_URL + SCRCPY_SERVER_URL);
  if (!res.ok) {
    throw new Error(`Failed to load scrcpy server (${res.status})`);
  }
  const jarBytes = new Uint8Array(await res.arrayBuffer());

  // 2. Push to the device under the canonical scrcpy server path. We
  //    wrap the bytes in a one-shot ReadableStream as the AdbSync API
  //    expects.
  const jarStream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(jarBytes);
      controller.close();
    },
  });
  await AdbScrcpyClient.pushServer(adb, jarStream, DefaultServerPath);

  // 3. Build options. We hard-code H.264 (universally supported in
  //    Chromium WebCodecs) and request `sendFrameMeta` so timestamps
  //    can flow into the mp4 muxer. `audio: false` keeps the bandwidth
  //    bill predictable; the widget UI doesn't expose audio anyway.
  const options = new AdbScrcpyOptions2_7({
    video: true,
    audio: false,
    control: true,
    videoCodec: 'h264',
    videoBitRate: opts.bitRate ?? 8_000_000,
    // 0 means "no cap" — scrcpy passes through whatever the encoder
    // produces. We hand a non-zero value to the server when the widget
    // wants to spare an Intel iGPU from decoding 60fps screens.
    maxFps: opts.maxFps ?? 0,
    sendFrameMeta: true,
    cleanup: true,
    // We don't care what scrcpy does with the screen on close.
    powerOffOnClose: false,
  });

  // 4. Spawn the server. AdbScrcpyClient.start handles `app_process`
  //    invocation, the localabstract socket handshake, and forward /
  //    reverse-tunnel fallback. After this resolves we can grab the
  //    video stream + control channel directly.
  const client = await AdbScrcpyClient.start(adb, DefaultServerPath, options);

  // `videoStream` is a Promise<AdbScrcpyVideoStream> when video is
  // enabled (which we did above). Awaiting it triggers the metadata
  // parse on the device-side header bytes.
  const videoP = client.videoStream;
  if (!videoP) {
    await client.close();
    throw new Error('scrcpy started without a video stream — check options');
  }
  const video = await (videoP as Promise<{ metadata: ScrcpyVideoStreamMetadata; stream: ReadableStream<ScrcpyMediaStreamPacket> }>);

  // We need two independent consumers of the same upstream packet
  // stream: the WebCodecs decoder (always live, drives the canvas)
  // and the mp4 muxer (only live while the user is recording). The
  // earlier shape exposed both as `ReadableStream`s tee'd from the
  // source — but that left the recording branch locked-but-unread,
  // which could backpressure the decoder, and the act of `getReader`-
  // ing the locked branch later raised
  //
  //   "ReadableStreamDefaultReader constructor can only accept
  //    readable streams that are not yet locked to a reader"
  //
  // when the user clicked Record. The reliable shape is to tee + drain
  // both branches up front and fan out raw bytes to a callback set
  // (no per-recording stream locking; subscribers come and go freely).
  const [packetsForDecoder, packetsForRaw] = video.stream.tee();
  const rawListeners = new Set<RawChunkListener>();
  // Drain `packetsForRaw` for the lifetime of the session so the tee
  // never stalls. Each packet's bytes are dispatched to whoever has
  // subscribed via `subscribeRaw`. Errors / EOF are swallowed — the
  // decoder branch surfaces them via its own `pipeTo` rejection.
  const rawReader = packetsForRaw.getReader();
  void (async () => {
    try {
      while (true) {
        const { done, value } = await rawReader.read();
        if (done) return;
        if (rawListeners.size > 0) {
          for (const fn of rawListeners) {
            try {
              fn(value.data);
            } catch {
              /* one bad subscriber shouldn't tear the loop */
            }
          }
        }
      }
    } catch {
      /* upstream closed / aborted — exit quietly */
    }
  })();

  return {
    metadata: video.metadata,
    packets: packetsForDecoder,
    subscribeRaw(fn: RawChunkListener) {
      rawListeners.add(fn);
      return () => {
        rawListeners.delete(fn);
      };
    },
    control: client.controller,
    dispose: async () => {
      try {
        await rawReader.cancel();
      } catch {
        /* ignore */
      }
      try {
        await client.close();
      } catch {
        /* ignore — already closed */
      }
    },
  };
}

/** Friendly codec name for UI strings. */
export function codecName(id: ScrcpyVideoCodecId): 'H.264' | 'H.265' | 'AV1' | 'unknown' {
  switch (id) {
    case ScrcpyVideoCodecId.H264:
      return 'H.264';
    case ScrcpyVideoCodecId.H265:
      return 'H.265';
    case ScrcpyVideoCodecId.AV1:
      return 'AV1';
    default:
      return 'unknown';
  }
}
