# Screen Mirror

The Screen Mirror widget is a scrcpy-style live screen of the device,
decoded in the browser via **WebCodecs**. It's capped at one instance
per dashboard so two Mirror tiles can't fight for the same H.264 stream.

<ThemeImage src-dark="/img/features/mirror-default.png" src-light="/img/features/mirror-default-light.png" alt="Screen Mirror tile" />

## How it works

WebLogcat ships a copy of `scrcpy-server-v2.7.jar` and pushes it to the
device on connect. The server captures the screen and streams an H.264
NAL stream back over the ADB transport; the widget decodes it using the
`@yume-chan/scrcpy-decoder-webcodecs` decoder and renders the frames to
a `<canvas>`.

Latency is roughly 50–150 ms over USB on a Pixel — not as tight as a
native `scrcpy`, but indistinguishable for non-game use.

## Interaction

- **Tap, drag, swipe.** Click on the canvas to send tap events. Drag to
  swipe. Multi-touch is mapped from `touch` events on touchscreens; on a
  laptop, click counts as a single touch.
- **Hardware buttons.** The bezel renders the standard Android buttons —
  Back, Home, Recents — plus power, volume up/down, rotate, screenshot,
  and record.
- **Type into the device.** Click the canvas first to focus, then type.
  Modifier keys forward through.

## Recording

The record button starts an MP4 capture of the live stream — encoded
with `mp4-muxer` directly in the browser, no server round-trip. The
recording icon turns red while it's running; click it again to stop.
The MP4 is saved to your downloads folder.

## Screenshot

The camera icon writes the current frame as a PNG to your downloads
folder. Lossless, full device resolution.

## Per-widget settings

- **Overlay font size.** Affects the per-frame stats overlay (toggled
  via the eye icon).
- **Bitrate cap.** Trade quality vs. bandwidth. Defaults to 8 Mbps.
- **Display rotation.** Force portrait, landscape, or auto.

## Compatibility

- Mirror needs a Chromium build with **WebCodecs** (Chrome / Edge 94+).
  Older browsers fall back to a *not supported* notice.
- The device needs to be modern enough to run the bundled scrcpy server
  (Android 7+ in practice).
- Some manufacturers block screen capture from certain apps (banking,
  DRM-protected video). Those frames render black — that's the device,
  not WebLogcat.
