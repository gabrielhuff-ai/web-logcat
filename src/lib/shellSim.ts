// In-memory shell simulator used when `usingFake` is true.
//
// Mirrors the built-in command list from
// `design/v2/source/widget-shell.jsx` so the no-phone demo path stays
// useful without opening a real ADB channel. Anything outside the
// allowlist resolves to the same `inaccessible or not found` message a
// real Android shell prints — keeps user expectations honest.
//
// Pure: no React, no DOM, no global state. Test-friendly.
//
// Supported: cd / ls / pwd / echo / cat / ps / getprop / whoami / id /
// uname / date / uptime / clear / exit / help.

/** Per-shell mutable state (cwd is the only entry today). */
export interface ShellSimState {
  cwd: string;
}

/** Result of evaluating one command line. */
export interface ShellSimResult {
  /** Lines to append to the scrollback. Empty array ⇒ no output. */
  lines: string[];
  /** Updated state. Always returned (caller should swap in even on no-op). */
  state: ShellSimState;
  /** Caller should clear the scrollback. */
  clear?: boolean;
  /** Caller should treat the channel as closed (`exit`). */
  exit?: boolean;
}

const FAKE_FS_HINTS: Record<string, string[]> = {
  '/': ['acct', 'data', 'dev', 'proc', 'sdcard', 'storage', 'system', 'vendor'],
  '/sdcard': ['DCIM', 'Download', 'Pictures', 'Music', 'Movies', 'Documents', 'Android'],
  '/sdcard/Download': [
    'invoice-202411.pdf',
    'backup-config.json',
    'instrumentation-trace.perfetto',
    'crash-report-2024-12-08.zip',
    'RELEASE_NOTES.md',
  ],
  '/system/bin': [
    'sh',
    'ls',
    'cat',
    'toolbox',
    'am',
    'pm',
    'settings',
    'logcat',
    'dumpsys',
    'input',
    'wm',
    'cmd',
  ],
};

const PROPS: Record<string, string> = {
  'ro.product.model': 'Pixel 8 Pro',
  'ro.product.brand': 'google',
  'ro.product.manufacturer': 'Google',
  'ro.build.version.release': '14',
  'ro.build.version.sdk': '34',
  'ro.serialno': '39021FDJG004XF',
};

// A small, static process table — close enough to the look of `ps` on
// device. Mirrors a subset of `logGenerator`'s PROCESSES so the demo
// stays consistent without dragging in that lazy-loaded module.
const PS_PROCESSES: ReadonlyArray<{ pid: number; pkg: string }> = [
  { pid: 982, pkg: 'system_server' },
  { pid: 1188, pkg: 'com.android.bluetooth' },
  { pid: 1421, pkg: 'com.android.systemui' },
  { pid: 2104, pkg: 'com.google.android.gms' },
  { pid: 2890, pkg: 'com.google.android.inputmethod.latin' },
  { pid: 3201, pkg: 'com.android.vending' },
  { pid: 4502, pkg: 'com.android.chrome' },
  { pid: 5810, pkg: 'com.spotify.music' },
  { pid: 8412, pkg: 'com.example.shopapp' },
  { pid: 8480, pkg: 'com.example.shopapp:remote' },
];

/** Initial cwd matches the prompt shown in the design reference. */
export function initialShellSimState(): ShellSimState {
  return { cwd: '/sdcard' };
}

/**
 * Evaluate one command. Empty / whitespace-only input is a no-op
 * (returns no lines, no state change) — same as a real shell.
 */
export function execShellSim(cmd: string, state: ShellSimState): ShellSimResult {
  const trimmed = cmd.trim();
  if (!trimmed) return { lines: [], state };
  const args = trimmed.split(/\s+/);
  const head = args[0];

  if (head === 'clear') return { lines: [], clear: true, state };
  if (head === 'exit') return { lines: ['Connection closed.'], state, exit: true };

  if (head === 'pwd') return { lines: [state.cwd], state };

  if (head === 'cd') {
    const target = args[1] ?? '/sdcard';
    const next = resolvePath(state.cwd, target);
    // Refuse to enter directories the fake FS doesn't know about so
    // the prompt only updates on a successful cd — matches the real
    // device behaviour where `cd nonexistent` leaves `pwd` unchanged.
    if (!isFakeDir(next)) {
      return {
        lines: [`/system/bin/sh: cd: ${target}: No such file or directory`],
        state,
      };
    }
    return { lines: [], state: { ...state, cwd: next } };
  }

  if (head === 'ls') {
    const arg = args.slice(1).find((a) => !a.startsWith('-'));
    const path = arg ? resolvePath(state.cwd, arg) : state.cwd;
    const entries = FAKE_FS_HINTS[path];
    if (entries) return { lines: [entries.join('  ')], state };
    return { lines: [`ls: ${path}: No such file or directory`], state };
  }

  if (head === 'echo') {
    return { lines: [args.slice(1).join(' ')], state };
  }

  if (head === 'whoami') return { lines: ['shell'], state };
  if (head === 'id') {
    return {
      lines: ['uid=2000(shell) gid=2000(shell) groups=2000(shell)'],
      state,
    };
  }
  if (head === 'uname') {
    if (args.includes('-a')) {
      return {
        lines: ['Linux localhost 5.15.41-android13-8 #1 SMP PREEMPT aarch64 Toybox'],
        state,
      };
    }
    return { lines: ['Linux'], state };
  }
  if (head === 'date') return { lines: [new Date().toString()], state };
  if (head === 'uptime') {
    return { lines: ['up 4 days, 21:14, load average: 1.42, 1.18, 0.92'], state };
  }

  if (head === 'getprop') {
    const key = args[1];
    if (key) return { lines: [PROPS[key] ?? ''], state };
    return {
      lines: Object.entries(PROPS).map(([k, v]) => `[${k}]: [${v}]`),
      state,
    };
  }

  if (head === 'ps') {
    return {
      lines: [
        'USER       PID   PPID  VSZ      RSS    WCHAN            ADDR S NAME',
        ...PS_PROCESSES.map(
          (p) =>
            `u0_a${100 + (p.pid % 50)}  ${String(p.pid).padEnd(5)} 412   1840412  ${(80000 + p.pid * 11).toString().padEnd(6)} do_epoll_wait      0 S ${p.pkg}`,
        ),
      ],
      state,
    };
  }

  if (head === 'cat') {
    const path = args[1];
    if (!path) return { lines: ['cat: missing operand'], state };
    if (path === '/proc/version') {
      return {
        lines: ['Linux version 5.15.41-android13-8 (kbuild@...) #1 SMP PREEMPT'],
        state,
      };
    }
    if (path === '/proc/cpuinfo') {
      const lines: string[] = [];
      for (let i = 0; i < 8; i++) {
        lines.push(`processor\t: ${i}`);
        lines.push('BogoMIPS\t: 38.40');
      }
      return { lines, state };
    }
    return { lines: [`cat: ${path}: No such file or directory`], state };
  }

  if (head === 'help' || head === '?') {
    return {
      lines: [
        'Built-in commands: cd, ls, pwd, echo, cat, ps, getprop, whoami, id, uname, date, uptime, clear, exit',
        '(this is a sandboxed ADB shell — most binaries are not available)',
      ],
      state,
    };
  }

  if (head === 'logcat') {
    return {
      lines: ['(use the Logcat widget instead — Ctrl+C to interrupt)'],
      state,
    };
  }

  return {
    lines: [`/system/bin/sh: ${head}: inaccessible or not found`],
    state,
  };
}

/**
 * Resolve `target` relative to `cwd`. Mirrors a real shell's path
 * handling for the cases the simulator cares about: absolute paths,
 * `..` parent traversal, and one-segment relative paths. No symlinks,
 * no `~`, no environment expansion.
 */
function resolvePath(cwd: string, target: string): string {
  if (target.startsWith('/')) return normalize(target);
  if (target === '.') return cwd;
  if (target === '..') return parent(cwd);
  // Multi-segment relative path: walk it like any unix shell.
  const segments = target.split('/').filter(Boolean);
  let out = cwd;
  for (const seg of segments) {
    if (seg === '.') continue;
    if (seg === '..') {
      out = parent(out);
      continue;
    }
    out = (out === '/' ? '' : out) + '/' + seg;
  }
  return normalize(out);
}

/**
 * Heuristic "does this path point to a directory the fake FS knows
 * about?" check. The FS map only records *directory listings*, not the
 * subdirectories themselves, so we accept either form: the path is a
 * listing key (`/sdcard`, `/sdcard/Download`, ...) or the parent's
 * listing names this path's basename (so `/sdcard/Pictures` is valid
 * because the `/sdcard` listing includes `Pictures`, even though
 * `Pictures` has no listing of its own).
 */
function isFakeDir(path: string): boolean {
  if (path === '/') return true;
  if (FAKE_FS_HINTS[path]) return true;
  const par = parent(path);
  const listing = FAKE_FS_HINTS[par];
  if (!listing) return false;
  const base = path.slice(par === '/' ? 1 : par.length + 1);
  return listing.includes(base);
}

function parent(path: string): string {
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  return parts.length ? '/' + parts.join('/') : '/';
}

function normalize(path: string): string {
  // Collapse repeated slashes and trailing slash (except for root).
  const out = path.replace(/\/+/g, '/');
  if (out.length > 1 && out.endsWith('/')) return out.slice(0, -1);
  return out;
}

// ---- Tab completion --------------------------------------------------------

export interface CompleteResult {
  /**
   * Full input line after applying the completion. When there's
   * exactly one match we extend the current word; with multiple
   * matches we extend by the longest common prefix. With no match
   * the input is unchanged.
   */
  input: string;
  /** Candidate names — populated when multiple matches exist. */
  options: string[];
}

/**
 * Produce a tab-completion for the current shell input. Splits the
 * line on whitespace, takes the last token as the path being typed,
 * resolves its directory + prefix against the simulated FS, and
 * returns either an extended input or a list of candidates. Hidden
 * entries (those starting with `.`) are skipped unless the prefix
 * itself starts with `.`, matching bash's default behaviour.
 */
export function completeShellInput(
  input: string,
  state: ShellSimState,
): CompleteResult {
  // Split on the LAST whitespace run so we don't have to tokenise the
  // whole command — preserves any quoting / arg structure ahead of
  // the cursor exactly as typed.
  const m = /^(.*\s)?(\S*)$/.exec(input);
  if (!m) return { input, options: [] };
  const prefixBeforeWord = m[1] ?? '';
  const word = m[2] ?? '';

  // Word splits into "directory part" + "filename prefix". A trailing
  // `/` means the filename prefix is empty (list everything in that
  // dir).
  const lastSlash = word.lastIndexOf('/');
  const dirPart = lastSlash >= 0 ? word.slice(0, lastSlash + 1) : '';
  const namePrefix = lastSlash >= 0 ? word.slice(lastSlash + 1) : word;

  // Resolve the directory we should list. `dirPart === ''` means the
  // current word is a bare filename → list the current cwd.
  const dirAbs = dirPart
    ? resolvePath(state.cwd, dirPart === '/' ? '/' : dirPart.replace(/\/$/, ''))
    : state.cwd;
  const entries = FAKE_FS_HINTS[dirAbs] ?? null;
  if (!entries) return { input, options: [] };

  const showHidden = namePrefix.startsWith('.');
  const matches = entries.filter((e) => {
    if (!showHidden && e.startsWith('.')) return false;
    return e.startsWith(namePrefix);
  });

  if (matches.length === 0) return { input, options: [] };

  if (matches.length === 1) {
    // Exactly one — replace with the full name. Append `/` so the
    // user can keep tabbing into a directory subtree (matches bash
    // behaviour for trivially-detectable directories).
    const completion = matches[0];
    const isDir = FAKE_FS_HINTS[(dirAbs === '/' ? '' : dirAbs) + '/' + completion] != null;
    const tail = isDir ? '/' : ' ';
    return {
      input: prefixBeforeWord + dirPart + completion + tail,
      options: [],
    };
  }

  // Multiple matches — extend by the longest common prefix and
  // surface the candidates so the caller can list them.
  const lcp = longestCommonPrefix(matches);
  return {
    input:
      lcp.length > namePrefix.length
        ? prefixBeforeWord + dirPart + lcp
        : input,
    options: matches,
  };
}

function longestCommonPrefix(strs: string[]): string {
  if (strs.length === 0) return '';
  let prefix = strs[0];
  for (let i = 1; i < strs.length; i += 1) {
    while (prefix.length > 0 && !strs[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
    if (prefix === '') return '';
  }
  return prefix;
}

/**
 * Strip a small subset of ANSI escape sequences. We only handle the
 * common SGR ("color") sequences and CSI cursor moves — enough that
 * the simulator's plain-text output and most `ps` / `ls --color`
 * variants render cleanly. Anything more exotic is silently dropped.
 *
 * Lives in this module because both the ANSI strip and the simulator
 * are line-rendering concerns. Exported separately so the real-shell
 * path can use it without pulling in the simulator at runtime.
 */
export function stripAnsi(s: string): string {
  // CSI ... letter (SGR + cursor) and OSC ... BEL/ST.
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '').replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, '');
}
