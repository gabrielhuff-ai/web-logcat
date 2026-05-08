# Connecting a device

WebLogcat talks to the phone directly from the browser via **WebUSB**. There
is no `adb` install on the laptop, no Android Studio, no proxy server —
permission is granted through Chromium's standard device chooser and the
on-device authorisation prompt.

## Prerequisites

- A **Chromium-based browser**: Chrome, Edge, Brave, Opera, Arc. Firefox and
  Safari don't ship WebUSB, so the **Connect a device** button is disabled
  there.
- The site served over **HTTPS** or from `localhost`. The hosted versions at
  `https://gabrielhuff.github.io/web-logcat/` (production) and
  `https://gabrielhuff.github.io/web-logcat/staging/` (staging) qualify; so
  does `npm run dev`.
- An **Android device** with USB debugging enabled in
  *Settings → System → Developer options*.

## The flow

<ThemeImage src-dark="/img/features/empty-state.png" src-light="/img/features/empty-state-light.png" alt="Connecting flow" />

1. Plug the device in with a data-capable USB cable.
2. Click **Connect a device**. The browser shows its device chooser; pick
   your phone.
3. The phone shows the standard *Allow USB debugging?* prompt the first
   time. Tick **Always allow from this computer** if you want subsequent
   connects to be silent.
4. The dashboard mounts with a single Logcat tile filling the viewport.
   The topbar shows the device model and serial; the connection dot is
   green for real devices and amber for the simulator. Use **+ Add
   widget** to add more tiles.

The browser remembers the WebUSB grant the same way it remembers any
other permission — the second connect from the same browser+device pair
is silent.

## Switching devices

The device pill in the topbar opens a picker showing every device the
browser has paired in this session, plus the simulator if it's been used.
Pick a row to switch; the previous stream stays warm in the background so
you can flip back without re-authorising.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Chooser is empty | Verify USB debugging is on, the device is unlocked, and the cable is data-capable. Replug and reload. |
| Pairing prompt never appears on the phone | Some OEMs hide it behind a notification. Pull down the shade. |
| `Connect a device` is disabled | You're on Firefox / Safari, or the page isn't served from HTTPS / localhost. |
| Connection drops on screen-off | Some manufacturers cut USB after sleep. Disable screen-locked-off behaviour or keep the screen awake. |
| Mirror shows "device not supported" | Mirror needs `scrcpy` v2.7 capabilities. Older / very locked-down devices may refuse the push. |

If the chooser shows the phone but the connect step fails, check the
browser console — the toast message comes from `friendlyConnectError()`
in [`lib/adb.ts`](https://github.com/gabrielhuff/web-logcat/blob/main/src/lib/adb.ts)
and the underlying error usually points at the cause (timeout, permission
denied, USB endpoint busy).

## Don't have a phone?

Click **fake data** on the empty state. The dashboard runs against the
[simulated stream](./simulator) so every widget renders against in-memory
fixtures.
