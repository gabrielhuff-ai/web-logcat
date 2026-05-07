// Shared logcat stream — one upstream `logcat -v threadtime` per ADB
// session, fanned out to N `LogcatWidget` subscribers via a tiny pub/sub.
//
// Why: a dashboard with K Logcat tiles previously meant K shell channels
// open against the same device, K parsers running, and K × MAX_LOGS
// buffers. With this hub:
//
//   - The transport layer (App.tsx → connectDevice / connectFake) feeds
//     `LogStreamHub.publish(entry)` once per new entry.
//   - Each widget instance subscribes via `subscribe(fn)`. On subscribe
//     it gets the current ring-buffer snapshot so it can hydrate without
//     waiting for the next batch.
//   - The hub keeps a single ring buffer capped at MAX_LOGS (5000 — the
//     same default as the v1 single-app buffer). Per-widget filter
//     state lives in the widget; the buffer is shared.
//
// The hub is intentionally a plain class (not a React context). The
// `LogStreamHub` instance lives on a ref in App.tsx and is shared via
// `LogStreamContext`. Exported as a class so tests can instantiate it
// without React.

import type { LogEntry } from '../types';

/**
 * Hard ceiling on the shared ring buffer. 50 k strikes a balance:
 * deep enough that a normal browsing session at the bottom never
 * sees an old log evicted under foot, low enough that a 50 k array
 * + the virtualiser's measurement cache stay comfortably under a
 * few MB. The Logcat widget pairs this with an anchor-based scroll
 * preservation strategy (`<LogList/>`) so trims that *do* happen
 * never shift the user's viewport — modelled on Android Studio's
 * Logcat tool window.
 */
export const MAX_LOGS = 50_000;

export type LogStreamListener = (entries: ReadonlyArray<LogEntry>, kind: 'snapshot' | 'append') => void;

export class LogStreamHub {
  #buffer: LogEntry[] = [];
  #listeners = new Set<LogStreamListener>();

  /** Push a single entry — most callers will use `publishMany`. */
  publish(entry: LogEntry): void {
    this.publishMany([entry]);
  }

  /** Push a batch and fan out a single notification per call. */
  publishMany(entries: ReadonlyArray<LogEntry>): void {
    if (entries.length === 0) return;
    this.#buffer.push(...entries);
    if (this.#buffer.length > MAX_LOGS) {
      this.#buffer.splice(0, this.#buffer.length - MAX_LOGS);
    }
    for (const fn of this.#listeners) {
      fn(entries, 'append');
    }
  }

  /** Wholesale replace the buffer (used by `clear()` + simulator hydration). */
  reset(initial: ReadonlyArray<LogEntry> = []): void {
    this.#buffer = initial.slice(-MAX_LOGS);
    for (const fn of this.#listeners) {
      fn(this.#buffer, 'snapshot');
    }
  }

  /** Snapshot of the current buffer. Cheap — returns the live array reference. */
  snapshot(): ReadonlyArray<LogEntry> {
    return this.#buffer;
  }

  /**
   * Subscribe to new entries. Fires immediately with a snapshot so the
   * subscriber can hydrate, then on every subsequent `publish*` /
   * `reset` call. Returns an unsubscribe fn.
   */
  subscribe(fn: LogStreamListener): () => void {
    this.#listeners.add(fn);
    fn(this.#buffer, 'snapshot');
    return () => {
      this.#listeners.delete(fn);
    };
  }

  /** Test helper / introspection — number of active subscribers. */
  get listenerCount(): number {
    return this.#listeners.size;
  }
}
