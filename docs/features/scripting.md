# Scripting

The Scripting widget turns one shell script into a custom control panel.
You write shell **functions**; you add **controls** that run them or feed
them values. It's a Tasker-style toolbox for the workflows you repeat —
"Package toolbox", "Performance lab", an app-debugger panel — without
building a real app.

<ThemeImage src-dark="/img/features/scripting-default.png" src-light="/img/features/scripting-default-light.png" alt="Scripting tile — a Package toolbox panel with a text input, action buttons, and a console" />

## The mental model

One panel owns one script. Every control's **label** decides the name the
script sees — there's no second naming step:

- An **input** labelled `Package` exports its value as the env var
  `$PACKAGE`.
- An **action button** labelled `Force stop` calls the function
  `force_stop` when pressed.
- A bound **display** labelled `Battery temperature` calls
  `battery_temp` and shows its output.

Names are derived deterministically — uppercased and snake-cased for
variables, lowercased for functions (so `Force stop` → `$FORCE_STOP` as a
value, `force_stop()` as a function). They use underscores, never hyphens,
because the device shell (mksh) requires it.

Every input's current value is exported on **every** run, so any function
can read any input. A `$PACKAGE` text field can drive a whole row of
buttons:

```sh
force_stop() { am force-stop "$PACKAGE"; }
clear_data() { pm clear "$PACKAGE"; }
info()       { dumpsys package "$PACKAGE" | grep versionName; }
```

## How runs work

Each run re-sources the whole script and calls one function, with input
values supplied as environment variables. Values are passed as separate
arguments, never spliced into the command text — so a value like
`; rm -rf /` is inert data, not code. Output (stdout, stderr, exit code)
lands in the panel's **console**.

Runs are one-shot — the script is re-sourced each time rather than kept
in a long-lived shell, so a function is always defined by the current
script and always sees the current input values.

## Controls

**Inputs** carry a value: text field, slider, knob, toggle, select,
stepper. A toggle exports `1` / `0`; everything else exports its value
verbatim.

**Action button** runs a function. Mark it *Confirm before running* for
destructive operations and it opens a Cancel / Run popover first.

**Displays** show a bound function's output:

| Display | Shows |
| --- | --- |
| **Console** | The most recent run — stdout, stderr, and the exit code. On by default. |
| **Readout** | A big number + unit pulled from the output. |
| **Status pill** | A label + the output's last line, coloured by exit status. |
| **Gauge** | The output as a value on a min/max arc. |
| **LED** | A coloured indicator driven by the output (`green` / `amber` / `red` / `blue` / `off`, or truthiness). |

Displays refresh on a configurable **auto-poll** interval (off by
default) and, optionally, whenever an input they read changes.

**Sections** group controls under a heading. They're visual only — they
don't change the shared environment.

## The builder

The tile's cog opens the builder: the shell script on the left (with a
**Run as root** toggle and a live legend of the variables and functions
in scope), the controls list and per-control settings on the right. Drag
to reorder controls; the split between panes is draggable and the
controls pane can collapse to give the editor the full width. Changes are
staged until you hit **Save panel**.

If the script fails a syntax check on a real device, the tile shows a
**script error** banner — click it to jump back into the builder — and
the action buttons are disabled until it parses.

## Sharing a panel

Scripting panels travel with the dashboard's
[import / export](./dashboard#sharing). Because an imported panel runs
shell commands on your device, the importer must acknowledge that
explicitly, and auto-polling displays start **paused** after an import —
nothing runs until you choose to enable it.

## Trying it without a device

On the [simulated stream](./simulator), the widget evaluates a small
subset of shell — `echo` / `printf` with `$VAR` substitution — so a demo
panel produces real-looking output with no phone attached.
