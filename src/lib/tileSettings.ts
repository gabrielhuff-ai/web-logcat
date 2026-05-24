// Per-tile widget settings — single source of truth backed by localStorage.
//
// Each widget kind defines its own settings shape + defaults; this hook
// is the generic plumbing that:
//   - Reads / writes JSON under
//       `weblogcat:settings:<deviceSerial>:<tileId>:<kind>`
//   - Hydrates from `localStorage` on mount, falling back to `defaults`.
//   - Pushes mutations back to `localStorage` AND emits an in-memory
//     pub/sub event so other consumers of the same key (e.g. an open
//     `<WidgetSettingsModal/>`) re-render without waiting on the
//     cross-tab `storage` event.
//   - Supports a one-shot migration of legacy keys (Logcat filters,
//     Shell cwd, Dumpsys preset) into the new shape.
//
// The "two surfaces, one state" contract lives here: any widget that
// uses this hook can render its on-bar controls AND the modal's
// matching controls, both reading / writing through the same setter.
//
// Decision: storage key includes the widget kind so two widgets of
// different kinds on the same tile id (impossible today, but cheap to
// guard against) can't collide. The serial is normalised to "sim" when
// the device is the simulator — `useAdb().usingFake` flips on for the
// fake-data path and we still want settings to persist across reloads.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdb } from './adbContext';
import type { WidgetKind } from '../types';

// ---- Storage key helpers ---------------------------------------------------

/** Resolve the live key for a (serial, tile, kind) triple. */
export function settingsKey(serial: string, tileId: string, kind: WidgetKind): string {
  return `weblogcat:settings:${serial}:${tileId}:${kind}`;
}

// ---- In-memory pub/sub -----------------------------------------------------
//
// `localStorage` only emits `storage` events to *other* documents, not
// the writing one. We need the writing document to notify its own
// subscribers (modal + widget body share the same hook instance and the
// same key). The bus is keyed by the full storage key so unrelated
// settings don't wake each other up.

type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();

function subscribe(key: string, fn: Listener): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) listeners.delete(key);
  };
}

function notify(key: string): void {
  const set = listeners.get(key);
  if (!set) return;
  for (const fn of set) fn();
}

// ---- Migration registry ----------------------------------------------------
//
// Each entry knows how to fold a single legacy key into the new shape.
// On hydration, if the new key is unset and any registered legacy key
// has a value, we read it, fold it in, persist the new shape, and
// delete the legacy keys.
//
// Widgets register their migrations via `registerSettingsMigration` at
// module load — keeping the migration table close to the widget that
// owns the legacy key, so this file doesn't need to know about every
// widget's pre-modal storage layout.

export interface SettingsMigration<T> {
  /** Build the legacy key for this (serial, tileId) pair. */
  legacyKey: (serial: string, tileId: string) => string;
  /** Read the raw localStorage value and merge it into the partial settings. */
  apply: (raw: string, partial: Partial<T>) => Partial<T>;
}

const migrations = new Map<WidgetKind, Array<SettingsMigration<unknown>>>();

export function registerSettingsMigration<T>(
  kind: WidgetKind,
  migration: SettingsMigration<T>,
): void {
  const list = migrations.get(kind) ?? [];
  list.push(migration as SettingsMigration<unknown>);
  migrations.set(kind, list);
}

function applyMigrations<T>(
  kind: WidgetKind,
  serial: string,
  tileId: string,
  base: T,
): { merged: T; touched: boolean } {
  const list = migrations.get(kind);
  if (!list || list.length === 0) return { merged: base, touched: false };
  let touched = false;
  let acc: Partial<T> = {};
  for (const m of list) {
    const lk = m.legacyKey(serial, tileId);
    let raw: string | null;
    try {
      raw = localStorage.getItem(lk);
    } catch {
      raw = null;
    }
    if (raw == null) continue;
    try {
      acc = (m as SettingsMigration<T>).apply(raw, acc);
      touched = true;
    } catch {
      // Garbage in legacy storage shouldn't crash the widget.
    }
    try {
      localStorage.removeItem(lk);
    } catch {
      /* ignore */
    }
  }
  if (!touched) return { merged: base, touched: false };
  return { merged: { ...base, ...acc }, touched: true };
}

// ---- Hydration -------------------------------------------------------------

/**
 * Read settings for `key` from `localStorage`, applying any registered
 * migrations from legacy keys when no value exists at the new key.
 *
 * Exported for tests; widget code should reach for `useTileSettings` instead.
 */
export function hydrateTileSettings<T extends object>(
  kind: WidgetKind,
  serial: string,
  tileId: string,
  defaults: T,
): T {
  const key = settingsKey(serial, tileId, kind);
  const fromNew = readSettings<T>(key, defaults);
  if (typeof localStorage === 'undefined') return fromNew;
  let rawNew: string | null = null;
  try {
    rawNew = localStorage.getItem(key);
  } catch {
    rawNew = null;
  }
  if (rawNew != null) return fromNew;
  const { merged, touched } = applyMigrations<T>(kind, serial, tileId, defaults);
  if (touched) {
    writeSettings(key, merged);
    return merged;
  }
  return fromNew;
}

function readSettings<T>(key: string, defaults: T): T {
  if (typeof localStorage === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<T>;
    if (parsed == null || typeof parsed !== 'object') return defaults;
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

function writeSettings<T>(key: string, value: T): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota / privacy mode
  }
}

// ---- Hook ------------------------------------------------------------------

/**
 * Persisted, shared per-tile widget settings.
 *
 * `defaults` MUST be a stable reference — pass a module-level object,
 * not an inline literal, otherwise rehydration runs on every render
 * and partial merges thrash. Widgets should declare their defaults at
 * module scope alongside their settings type.
 */
export function useTileSettings<T extends object>(
  tileId: string,
  kind: WidgetKind,
  defaults: T,
): readonly [T, (patch: Partial<T>) => void] {
  const { device, usingFake } = useAdb();
  // The simulator path has no serial — use the well-known "sim" bucket
  // so settings persist across reloads in fake mode too. This matches
  // `useTweaks`'s approach of storing under a single global key.
  const serial = device?.serial ?? (usingFake ? 'sim' : 'sim');
  const key = settingsKey(serial, tileId, kind);

  // Defaults are captured by ref so the setter can read them without
  // closing over a freshly-built object every render.
  const defaultsRef = useRef(defaults);

  // Hydrate (with one-shot migration) on first render of this key.
  const [state, setState] = useState<T>(() =>
    hydrateTileSettings(kind, serial, tileId, defaults),
  );

  // Re-hydrate when the storage key changes (device swap).
  const lastKeyRef = useRef(key);
  useEffect(() => {
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    const fresh = readSettings<T>(key, defaultsRef.current);
    setState(fresh);
  }, [key]);

  // Subscribe to in-memory bus so co-mounted consumers (modal + widget)
  // see each other's writes immediately.
  useEffect(() => {
    return subscribe(key, () => {
      setState(readSettings<T>(key, defaultsRef.current));
    });
  }, [key]);

  // Cross-tab updates also wake us up. Guard the parse so other apps'
  // localStorage events don't crash the listener.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      setState(readSettings<T>(key, defaultsRef.current));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key]);

  const set = useCallback(
    (patch: Partial<T>) => {
      setState((prev) => {
        const next = { ...prev, ...patch };
        writeSettings(key, next);
        notify(key);
        return next;
      });
    },
    [key],
  );

  return [state, set] as const;
}
