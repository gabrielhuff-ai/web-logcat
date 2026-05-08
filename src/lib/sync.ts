// Thin wrapper over `adb.sync()` (yume-chan's `AdbSync`) that gives the
// Files widget exactly three operations:
//
//   list(path)                  — readdir → SyncEntry[]
//   read(path)                  — ReadableStream<Uint8Array>
//   write(path, stream, onProgress) — push, with progress events for
//                                     files >1MB.
//
// Why a wrapper:
//   - The widget shouldn't import from `@yume-chan/adb/.../sync.js`
//     directly. Keeping the surface area thin here means swapping
//     transports later (or stubbing in tests) is a one-file change.
//   - The yume-chan `write()` doesn't expose progress; we wrap the
//     incoming `ReadableStream` in a TransformStream that counts bytes
//     and fires `onProgress` from there. The 1MB threshold matches the
//     HANDOFF guidance — no point flashing a progress bar for a 4KB
//     config file.
//   - Simulator path: when `usingFake` is true the dashboard hands
//     widgets a `null` Adb handle. `createSync(null)` returns a
//     SyncFs backed by an in-memory tree (`syncSim.ts`) so the
//     no-phone demo still browses a plausible Android filesystem.
//
// Mirrors the Phase 6 ShellWidget pattern: a real-channel branch and a
// usingFake branch live behind the same interface.

import type { Adb } from '@yume-chan/adb';
import {
  buildSimFs,
  type SimNode,
  simList,
  simNodeAt,
  simRead,
  simMkdir,
  simRemove,
} from './syncSim';

/** Threshold above which `write()` will fire `onProgress` callbacks. */
export const PROGRESS_THRESHOLD = 1024 * 1024;

/** What the Files widget needs about each entry — narrower than yume-chan's. */
export interface SyncEntry {
  name: string;
  /** 'dir' | 'file' | 'link' (we don't model sockets, fifos, etc.). */
  type: 'dir' | 'file' | 'link';
  /** Bytes for files. 0 for dirs / links. */
  size: number;
  /** Unix epoch seconds, mirrors the ADB sync wire shape. */
  mtime: number;
  /** Octal permission bits (e.g. 0o755). */
  permission: number;
  /** Resolved target if `type === 'link'` (best effort, may be null). */
  linkTarget?: string | null;
}

export interface WriteProgress {
  /** Bytes pushed so far. */
  bytes: number;
  /** Total bytes if known up-front, else null. */
  total: number | null;
}

export interface SyncFs {
  /** True when this is the in-memory simulator. Widgets gate write/push toasts on it. */
  readonly usingFake: boolean;
  list(path: string): Promise<SyncEntry[]>;
  read(path: string): ReadableStream<Uint8Array>;
  write(
    path: string,
    stream: ReadableStream<Uint8Array>,
    options?: { total?: number; onProgress?: (p: WriteProgress) => void },
  ): Promise<void>;
  /**
   * Create a directory. yume-chan's sync protocol doesn't expose mkdir
   * directly, so the real-device implementation runs `mkdir -p` over a
   * shell channel — same workaround the upstream Tango demo uses.
   */
  mkdir(path: string): Promise<void>;
  /**
   * Recursively remove a file or directory at `path`. The shell-out
   * uses `rm -rf` so it works for both kinds without inspecting the
   * entry first; `-f` swallows missing-target / permission errors so
   * a stale tree doesn't surface a TS exception. The simulator path
   * mutates its in-memory tree so the next `list()` reflects the
   * deletion.
   */
  remove(path: string): Promise<void>;
  /**
   * Ask the device to open a file with its default app. Runs
   * `am start -a android.intent.action.VIEW -d "file://<path>" -t
   * "<mime>"` over a shell channel. The MIME is guessed from the
   * extension (`mimeForExtension`). Modern Android (>=N) blocks
   * `file://` URIs from outside an app's `FileProvider`, so this is
   * a best-effort: it works on rooted ROMs / some OEM viewers and is
   * a useful debugging tool, not a guarantee. The simulator just
   * resolves a "Simulated mode" string for the toast.
   */
  open(path: string): Promise<{ ok: boolean; reason?: string }>;
  /** Release any held resources (sync socket on the real path, no-op on the sim). */
  dispose(): Promise<void>;
}

/**
 * Best-effort MIME type from a file path. Used by `SyncFs.open` to
 * pick a value for `am start -t <mime>`. The list is intentionally
 * short — Android's resolver does its own sniff anyway, and a wildcard
 * fallback lets the user's chooser pick.
 */
export function mimeForExtension(path: string): string {
  const dot = path.lastIndexOf('.');
  if (dot < 0) return '*/*';
  const ext = path.slice(dot + 1).toLowerCase();
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'json': return 'application/json';
    case 'zip': return 'application/zip';
    case 'apk': return 'application/vnd.android.package-archive';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    case 'svg': return 'image/svg+xml';
    case 'mp4':
    case 'm4v': return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'mp3': return 'audio/mpeg';
    case 'm4a': return 'audio/mp4';
    case 'wav': return 'audio/wav';
    case 'ogg': return 'audio/ogg';
    case 'txt':
    case 'log':
    case 'md': return 'text/plain';
    case 'html':
    case 'htm': return 'text/html';
    case 'csv': return 'text/csv';
    case 'xml': return 'text/xml';
    default: return '*/*';
  }
}

/**
 * Open a `SyncFs` for the given Adb handle, or the simulator if `adb`
 * is null. Returns immediately on the simulator path; on the real path
 * defers the `adb.sync()` open until the first call so the widget can
 * surface errors lazily.
 */
export function createSync(adb: Adb | null): SyncFs {
  if (!adb) return createSimSync();
  return createRealSync(adb);
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

/**
 * Re-wrap an error from yume-chan with operation context so the toast
 * the widget shows tells the user *what* failed (push vs. pull, on which
 * path) rather than just surfacing the raw deserializer message.
 *
 * `ExactReadableEndedError` is the one we see most: it bubbles up when
 * the device or transport closes the sync socket mid-response (no FAIL
 * frame). The user's only signal is the toast, so spell out what to try.
 */
/**
 * Wrap `s` in POSIX-shell single quotes, escaping any internal
 * single quotes. Required because `AdbShellProtocolSubprocessService`
 * joins argv with spaces, so a path like `Foo Bar.pdf` reaches the
 * device as three tokens unless we quote it. Single quotes also
 * neutralise every other shell metacharacter (`$`, `;`, `&`, etc.).
 */
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function annotateSyncError(e: unknown, op: 'push' | 'pull', path: string): Error {
  const original = e instanceof Error ? e : new Error(String(e));
  if (/ExactReadable ended/i.test(original.message)) {
    return new Error(
      `${op === 'push' ? 'Push' : 'Pull'} failed: device closed the ` +
        `sync channel for ${path}. This usually means a permissions or ` +
        `path error — try a writable directory like /sdcard/Download.`,
    );
  }
  return new Error(`${op === 'push' ? 'Push' : 'Pull'} failed: ${original.message}`);
}

// ---------------------------------------------------------------------------
// Real ADB-backed implementation.
// ---------------------------------------------------------------------------

function createRealSync(adb: Adb): SyncFs {
  // Lazy single-flight open. Kept on the closure so consecutive calls
  // share one sync socket — yume-chan's docs warn that opening many in
  // parallel can saturate the device transport.
  let openP: Promise<Awaited<ReturnType<Adb['sync']>>> | null = null;
  const openSync = () => {
    if (!openP) openP = adb.sync();
    return openP;
  };

  return {
    usingFake: false,

    async list(path) {
      const s = await openSync();
      const entries = await s.readdir(path);
      const out: SyncEntry[] = [];
      for (const e of entries) {
        // yume-chan's LinuxFileType is { Directory: 4, File: 8, Link: 10 }.
        const type: SyncEntry['type'] =
          e.type === 4 ? 'dir' : e.type === 10 ? 'link' : 'file';
        out.push({
          name: e.name,
          type,
          size: Number(e.size),
          mtime: Number(e.mtime),
          permission: e.permission,
          // yume-chan's readdir doesn't return link targets in v1; v2
          // optionally does but the field isn't on the narrow type.
          // Best effort: leave null. The widget shows `→ ?` if needed.
          linkTarget: null,
        });
      }
      return out;
    },

    read(path) {
      // yume-chan's `read()` returns its own (polyfill) ReadableStream;
      // we rewrap as a DOM ReadableStream so widget consumers see one
      // consistent type. The `pull()` callback defers the actual sync
      // socket open until the first read so the widget can start a
      // download UI immediately.
      type AnyReader = { read(): Promise<{ done: boolean; value?: Uint8Array }>; cancel(): Promise<void> };
      let reader: AnyReader | null = null;
      return new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            if (!reader) {
              const s = await openSync();
              const inner = s.read(path) as unknown as { getReader(): AnyReader };
              reader = inner.getReader();
            }
            const { done, value } = await reader.read();
            if (done) controller.close();
            else if (value) controller.enqueue(value);
          } catch (e) {
            controller.error(annotateSyncError(e, 'pull', path));
          }
        },
        async cancel() {
          try {
            await reader?.cancel();
          } catch {
            /* ignore */
          }
        },
      });
    },

    async write(path, stream, options) {
      let s;
      try {
        s = await openSync();
      } catch (e) {
        throw annotateSyncError(e, 'push', path);
      }
      const onProgress = options?.onProgress;
      const total = options?.total ?? null;
      let bytes = 0;

      // Tee progress out by inserting a counting TransformStream
      // upstream of yume-chan's writer. We only fire progress events
      // when total is known to exceed PROGRESS_THRESHOLD — matches the
      // HANDOFF "files >1MB" rule.
      const shouldReport =
        onProgress != null && (total == null || total >= PROGRESS_THRESHOLD);

      const counting = shouldReport
        ? stream.pipeThrough(
            new TransformStream<Uint8Array, Uint8Array>({
              transform(chunk, controller) {
                bytes += chunk.byteLength;
                onProgress?.({ bytes, total });
                controller.enqueue(chunk);
              },
            }),
          )
        : stream;

      // yume-chan's `write` accepts MaybeConsumable<Uint8Array>. A plain
      // `ReadableStream<Uint8Array>` flows through unchanged because of
      // the `T | Consumable<T>` union — no wrapping needed.
      try {
        await s.write({
          filename: path,
          // Cast: the widget gives us the global ReadableStream from File.stream();
          // yume-chan re-exports its own type-compatible shape from stream-extra.
          // The runtime shape is identical (Web Streams).
          file: counting as unknown as Parameters<typeof s.write>[0]['file'],
        });
      } catch (e) {
        throw annotateSyncError(e, 'push', path);
      }

      // Final tick — if the stream produced fewer bytes than expected
      // (e.g. seek), still flush the last value so the UI lands at 100%.
      if (shouldReport && total != null) {
        onProgress?.({ bytes: total, total });
      }
    },

    async mkdir(path) {
      // Sync protocol has no MKDIR. The conventional workaround (also
      // used by adb's own command line) is to shell out:
      //     `mkdir -p <path>`
      // — `-p` is a no-op when the path already exists, which matches
      // the widget's "create folder" UX (idempotent on retries).
      const sp = adb.subprocess.shellProtocol;
      const cmd = ['mkdir', '-p', shellQuote(path)];
      if (sp) {
        const proc = await sp.spawn(cmd);
        const code = await proc.exited;
        if (code !== 0) {
          throw new Error(`mkdir failed (exit ${code})`);
        }
        return;
      }
      // Devices stuck on shell-v1 (very old ROMs) — fall back to
      // noneProtocol and accept that we can't read an exit code.
      await adb.subprocess.noneProtocol.spawnWaitText(cmd);
    },

    async remove(path) {
      // `rm -rf` handles both files and directories; `-f` swallows
      // missing-target / permission errors so a refresh-then-delete
      // race doesn't crash the widget.
      const sp = adb.subprocess.shellProtocol;
      const cmd = ['rm', '-rf', shellQuote(path)];
      if (sp) {
        const proc = await sp.spawn(cmd);
        const code = await proc.exited;
        if (code !== 0) {
          throw new Error(`rm -rf failed (exit ${code})`);
        }
        return;
      }
      await adb.subprocess.noneProtocol.spawnWaitText(cmd);
    },

    async open(path) {
      // APKs use `pm install` over the shell channel. On Android 14+,
      // SELinux blocks `system_server` (which actually runs the
      // install) from reading FUSE-mounted /sdcard paths — the
      // device error spelled it out:
      //
      //   avc: denied { read } for ... tcontext=u:object_r:fuse:s0
      //   Consider using a file under /data/local/tmp/
      //
      // So we stage the APK into `/data/local/tmp` (where the shell
      // uid can write and `system_server` can read), run `pm install`
      // from there, capture pm install's exit code, then clean up —
      // all in a single shell call so we don't pay three round-trip
      // latencies. `rc=$? ; rm -f ... ; exit $rc` preserves pm
      // install's exit code while still removing the staging copy.
      //
      // Non-APK files still go through an `am start VIEW` intent so
      // the device shows the user's chosen viewer.
      const mime = mimeForExtension(path);
      const isApk = path.toLowerCase().endsWith('.apk');
      const sp = adb.subprocess.shellProtocol;
      try {
        if (isApk) {
          const slash = path.lastIndexOf('/');
          const basename = slash >= 0 ? path.substring(slash + 1) : path;
          const tmpPath = `/data/local/tmp/${basename}`;
          const inner =
            `cp ${shellQuote(path)} ${shellQuote(tmpPath)} && ` +
            `pm install -r -t -d ${shellQuote(tmpPath)} ; ` +
            `rc=$? ; ` +
            `rm -f ${shellQuote(tmpPath)} ; ` +
            `exit $rc`;
          // yume-chan joins argv with spaces, so wrap the whole
          // inner script in a single-quoted token that survives the
          // join intact. `shellQuote` does the `'\''`-style escape
          // we need.
          const cmd = ['sh', '-c', shellQuote(inner)];
          if (sp) {
            const res = await sp.spawnWaitText(cmd);
            const out = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim();
            // pm install sometimes exits 0 even on failure — it
            // signals failure by printing `Failure [INSTALL_FAILED_*]`.
            // Treat any "Failure" token in the combined output as an
            // error so the user sees the real reason.
            if (res.exitCode !== 0 || /Failure/i.test(out)) {
              return {
                ok: false,
                reason:
                  out ||
                  `pm install exit ${res.exitCode}`,
              };
            }
            return { ok: true };
          }
          // Shell-v1 fallback: combined stdout+stderr only, no exit code.
          const text = await adb.subprocess.noneProtocol.spawnWaitText(cmd);
          if (/Failure/i.test(text)) {
            return { ok: false, reason: text.trim() };
          }
          return { ok: true };
        }
        const fileUri = `file://${path}`;
        const cmd = [
          'am',
          'start',
          '-a',
          'android.intent.action.VIEW',
          '-d',
          shellQuote(fileUri),
          '-t',
          mime,
          '--grant-read-uri-permission',
        ];
        if (sp) {
          const proc = await sp.spawn(cmd);
          const code = await proc.exited;
          if (code !== 0) {
            return { ok: false, reason: `am start exit ${code}` };
          }
          return { ok: true };
        }
        await adb.subprocess.noneProtocol.spawnWaitText(cmd);
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          reason: err instanceof Error ? err.message : String(err),
        };
      }
    },

    async dispose() {
      if (!openP) return;
      try {
        const s = await openP;
        await s.dispose();
      } catch {
        /* already closed */
      }
      openP = null;
    },
  };
}

// ---------------------------------------------------------------------------
// Simulator-backed implementation. Lives here (not syncSim.ts) so the
// SyncFs surface is the only public API; syncSim.ts stays a pure store.
// ---------------------------------------------------------------------------

function createSimSync(): SyncFs {
  const root: SimNode = buildSimFs();

  return {
    usingFake: true,

    async list(path) {
      const node = simNodeAt(root, path);
      if (!node) throw new Error(`No such file or directory: ${path}`);
      if (node.type !== 'dir') {
        throw new Error(`Not a directory: ${path}`);
      }
      return simList(node);
    },

    read(path) {
      const bytes = simRead(root, path);
      // Single-chunk stream. The simulator never returns megabyte-scale
      // contents (the canned fake files are tiny), so chunking would be
      // pure overhead.
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      });
    },

    async write(_path, stream, options) {
      // The simulator doesn't actually persist anything — the widget
      // surfaces a "fake mode: not pushed" toast. We still drain the
      // stream + fire progress events so callers don't leak the source.
      const reader = stream.getReader();
      const onProgress = options?.onProgress;
      const total = options?.total ?? null;
      let bytes = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            bytes += value.byteLength;
            if (onProgress && (total == null || total >= PROGRESS_THRESHOLD)) {
              onProgress({ bytes, total });
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    },

    async mkdir(path) {
      simMkdir(root, path);
    },

    async remove(path) {
      simRemove(root, path);
    },

    async open(_path) {
      // Simulator has no real file system + no Activity Manager.
      // Return ok:false so the widget shows a "Simulated mode" toast,
      // mirroring how push/pull behave.
      return { ok: false, reason: 'Simulated mode — open ignored' };
    },

    async dispose() {
      /* nothing to release */
    },
  };
}
