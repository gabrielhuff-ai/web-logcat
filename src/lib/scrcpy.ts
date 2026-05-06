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
import { ReadableStream, TransformStream } from '@yume-chan/stream-extra';

/** URL of the vendored jar relative to the deployed app root. */
export const SCRCPY_SERVER_URL = 'scrcpy/scrcpy-server-v2.7.jar';
/** scrcpy server version string — must match the jar exactly. */
export const SCRCPY_VERSION = '2.7';

/**
 * What the widget consumes after a successful `startScrcpy`.
 *
 *   - `metadata` — codec id + source dimensions reported by scrcpy.
 *   - `video`    — the raw NAL-unit byte stream (Uint8Array chunks).
 *                  Tee this once for the WebCodecs decoder and once for
 *                  the mp4 muxer.
 *   - `packets`  — same data, but already framed into
 *                  `ScrcpyMediaStreamPacket`s ready for the WebCodecs
 *                  decoder's `writable`.
 *   - `control`  — typed sender for tap / key / power / etc.
 *   - `dispose`  — kill the server process + close the transport.
 */
export interface ScrcpySession {
  metadata: ScrcpyVideoStreamMetadata;
  /** Raw H.264 / H.265 NAL units, as produced by scrcpy. */
  video: ReadableStream<Uint8Array>;
  /** Same data reframed into typed packets — pipe to the decoder's writable. */
  packets: ReadableStream<ScrcpyMediaStreamPacket>;
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

  // We hand callers two views of the byte stream:
  //   - `packets`: typed `ScrcpyMediaStreamPacket`s for the WebCodecs
  //     decoder's `writable`.
  //   - `video`:  raw `Uint8Array` NAL data — the muxer needs this so
  //     it can pair frames with the decoder's encoded chunks.
  // Tee the source so consumers can attach independently. We do it via
  // `tee()` on the typed-packet stream and reproject one branch back to
  // raw bytes for the recorder path.
  const [packetsForDecoder, packetsForRecorder] = video.stream.tee();

  const rawForRecorder = packetsForRecorder.pipeThrough(
    new TransformStream<ScrcpyMediaStreamPacket, Uint8Array>({
      transform(packet, controller) {
        // Both `data` and `configuration` packets carry their bytes in
        // a `.data` field — emit them all so the muxer can sniff SPS/
        // PPS headers as well as the IDR / non-IDR slices.
        controller.enqueue(packet.data);
      },
    }),
  );

  return {
    metadata: video.metadata,
    video: rawForRecorder,
    packets: packetsForDecoder,
    control: client.controller,
    dispose: async () => {
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
