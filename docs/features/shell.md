# Shell

The Shell widget is an interactive ADB shell tied to one tile. Each tile
owns its own channel — opening two Shell tiles gives you two independent
sessions, with separate working directories and history.

<ThemeImage src-dark="/img/features/shell-default.png" src-light="/img/features/shell-default-light.png" alt="Shell tile" />

## Running commands

Type a command at the prompt and hit `Enter`. The output streams into the
scrollback as it arrives, the same way `adb shell` would render it in a
terminal.

The shell is a regular interactive `sh` channel on the device, so anything
the device's shell understands works — pipes, `grep`, `find`, multi-line
commands, etc. There is no remote `bash` unless your device ships one.

## History

- `↑` / `↓` walks history backwards / forwards.
- History is per-tile and persists across reloads.
- `Ctrl+L` clears the visible scrollback (history is preserved).

## Working directory

The first prompt drops you in the device's home (commonly `/sdcard`). Use
`cd` like normal — the prompt updates to reflect the new location. The
default starting path is configurable in the per-widget settings modal
(the cog in the header).

## Built-ins

The widget recognises a small set of host-side built-ins that don't go
over the wire:

- `clear` (alias `cls`) — equivalent to `Ctrl+L`.
- `help` — list built-ins. `help <name>` prints details for one.
- `exit` — close the channel. The next command reopens it automatically.

Everything else is forwarded to the device.

## Simulator behaviour

When you're connected to the [simulated stream](./simulator), the Shell
widget drops you into an in-memory fake (`lib/shellSim.ts`) that
recognises the most common commands — `pwd`, `ls`, `cat`, `whoami`,
`uname` — and simulated filesystem paths under `/sdcard/`. Use it to
poke around the widget without a phone.

## Per-widget settings

- **Home directory.** Override the starting `cd` when the tile mounts.
- **Font size.** Bumps the shell text without affecting the rest of the
  dashboard.

Changes persist per-tile via `localStorage`.
