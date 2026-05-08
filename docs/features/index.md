# Features

WebLogcat is a dashboard of independent **widgets** — one ADB capability per
draggable, resizable tile. Pair a device once, then mix and match the widgets
you need on a single screen.

## Quick start

1. Open the <a data-app-link href="../../">live app</a> in Chrome, Edge, or another
   Chromium-based browser — WebUSB is required and Firefox / Safari
   don't ship it.
2. Plug in an Android device with USB debugging enabled.
3. Click **Connect a device** and accept the on-device authorisation prompt.
4. The dashboard mounts with a single Logcat tile filling the viewport. Use
   **+ Add widget** in the topbar to grow the layout — Shell, Dumpsys, Files,
   Screen Mirror, or another Logcat. Each new widget splits the focused tile.

No phone handy? Click **fake data** instead — the dashboard runs against a
[simulated stream](./simulator) so you can poke around every widget without
touching real hardware.

![WebLogcat dashboard](/screenshot.png)

## In this section

| Page | What it covers |
| --- | --- |
| [Connecting a device](./connecting) | WebUSB pairing, supported browsers, troubleshooting the chooser |
| [Dashboard & layout](./dashboard) | The dwindle layout, swap-drag, resize seams, max / restore, undo / redo |
| [Logcat](./logcat) | Filter chips, level pills, pinned rows, search, heatmap, crash collapse |
| [Shell](./shell) | Interactive ADB shell, history, clearing scrollback |
| [Dumpsys](./dumpsys) | Presets and parsed cards vs. raw output |
| [Files](./files) | Browsing, pulling, and pushing files over the ADB sync protocol |
| [Screen Mirror](./screen-mirror) | scrcpy-style mirror, hardware buttons, screenshot, MP4 recording |
| [Simulated stream](./simulator) | The fake-data path for trying everything without a phone |
| [Appearance & settings](./settings) | Theme, accent, compact mode, performance mode, stream speed |

## Compatibility

- **Browser.** Chromium-based only. Chrome, Edge, Brave, Opera all work.
  Screen Mirror additionally needs WebCodecs (Chromium 94+).
- **Transport.** HTTPS or `localhost`. Any other origin blocks the WebUSB
  device chooser.
- **Device.** Android with USB debugging on. Shell, Dumpsys, and Files use
  the shell-protocol v2 spawn (`adb` v2.x); older devices fall back to an
  inline notice. Mirror requires a device able to run
  `scrcpy-server-v2.7.jar`, which the app pushes for you.
