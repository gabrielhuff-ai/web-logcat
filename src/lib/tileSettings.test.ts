// Pure-logic tests for the per-tile settings store: round-tripping the
// shape through localStorage and folding legacy keys into the new shape
// during hydration.

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  hydrateTileSettings,
  registerSettingsMigration,
  settingsKey,
} from './tileSettings';

// Vitest under node has no DOM globals — install a minimal in-memory
// localStorage shim before any code path touches it. Only needs the
// methods the hook calls.
beforeAll(() => {
  if (typeof globalThis.localStorage !== 'undefined') return;
  const store = new Map<string, string>();
  const shim: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => {
      store.delete(k);
    },
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: shim,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  localStorage.clear();
});

interface DemoSettings {
  fontSize: number;
  wrap: boolean;
  filters: ReadonlyArray<{ type: string; value: string }>;
}

const DEMO_DEFAULTS: DemoSettings = {
  fontSize: 12,
  wrap: false,
  filters: [],
};

describe('settingsKey', () => {
  it('produces a stable, global (serial-free) key', () => {
    expect(settingsKey('tile-A', 'logcat')).toBe('weblogcat:settings:tile-A:logcat');
  });
});

describe('hydrateTileSettings', () => {
  it('returns defaults when nothing is stored', () => {
    const out = hydrateTileSettings<DemoSettings>(
      'logcat',
      'sim',
      'tile-1',
      DEMO_DEFAULTS,
    );
    expect(out).toEqual(DEMO_DEFAULTS);
  });

  it('merges stored partial onto defaults', () => {
    const k = settingsKey('tile-1', 'logcat');
    localStorage.setItem(k, JSON.stringify({ fontSize: 14 }));
    const out = hydrateTileSettings<DemoSettings>(
      'logcat',
      'sim',
      'tile-1',
      DEMO_DEFAULTS,
    );
    expect(out.fontSize).toBe(14);
    // Untouched keys keep their default values.
    expect(out.wrap).toBe(false);
    expect(out.filters).toEqual([]);
  });

  it('falls back to defaults if stored JSON is corrupt', () => {
    const k = settingsKey('tile-1', 'logcat');
    localStorage.setItem(k, '!! not json {{');
    const out = hydrateTileSettings<DemoSettings>(
      'logcat',
      'sim',
      'tile-1',
      DEMO_DEFAULTS,
    );
    expect(out).toEqual(DEMO_DEFAULTS);
  });
});

describe('per-serial recovery', () => {
  it('adopts a value left under the old per-serial key into the global key', () => {
    // Simulate settings saved while connected as "Pixel-7"…
    localStorage.setItem(
      'weblogcat:settings:Pixel-7:tile-2:logcat',
      JSON.stringify({ fontSize: 18 }),
    );
    // …then a reconnect that resolves a different serial reads the global key.
    const out = hydrateTileSettings<DemoSettings>('logcat', 'other-serial', 'tile-2', DEMO_DEFAULTS);
    expect(out.fontSize).toBe(18);
    // The recovered value is promoted to the global key for next time.
    const stored = JSON.parse(
      localStorage.getItem(settingsKey('tile-2', 'logcat')) ?? '{}',
    ) as DemoSettings;
    expect(stored.fontSize).toBe(18);
  });

  it('prefers a real-device bucket over the simulator bucket', () => {
    localStorage.setItem('weblogcat:settings:sim:tile-3:logcat', JSON.stringify({ fontSize: 1 }));
    localStorage.setItem('weblogcat:settings:Pixel-9:tile-3:logcat', JSON.stringify({ fontSize: 2 }));
    const out = hydrateTileSettings<DemoSettings>('logcat', 'sim', 'tile-3', DEMO_DEFAULTS);
    expect(out.fontSize).toBe(2);
  });

  it('leaves defaults when no prior bucket exists', () => {
    const out = hydrateTileSettings<DemoSettings>('logcat', 'sim', 'tile-4', DEMO_DEFAULTS);
    expect(out).toEqual(DEMO_DEFAULTS);
  });
});

describe('registerSettingsMigration', () => {
  beforeEach(() => {
    // Each test registers its own one-shot migration. We rely on
    // localStorage being cleared between tests via the afterEach above
    // — the migration registry itself is module-scoped and persists.
  });

  it('folds a legacy key into the new shape and deletes the legacy key', () => {
    const legacy = (serial: string, tileId: string) =>
      `weblogcat:demo:${serial}:${tileId}:legacy`;
    registerSettingsMigration<DemoSettings>('files', {
      legacyKey: legacy,
      apply: (raw, partial) => ({ ...partial, fontSize: Number(raw) }),
    });

    localStorage.setItem(legacy('Pixel-A', 'tile-9'), '15');
    const out = hydrateTileSettings<DemoSettings>(
      'files',
      'Pixel-A',
      'tile-9',
      DEMO_DEFAULTS,
    );

    expect(out.fontSize).toBe(15);
    // Legacy key should have been removed after a successful migration.
    expect(localStorage.getItem(legacy('Pixel-A', 'tile-9'))).toBeNull();
    // And the new shape should be persisted under the global key.
    const newKey = settingsKey('tile-9', 'files');
    const stored = JSON.parse(localStorage.getItem(newKey) ?? '{}') as DemoSettings;
    expect(stored.fontSize).toBe(15);
  });

  it('skips migration when the new key already exists', () => {
    const legacy = (serial: string, tileId: string) =>
      `weblogcat:demo:${serial}:${tileId}:other`;
    registerSettingsMigration<DemoSettings>('shell', {
      legacyKey: legacy,
      apply: (raw, partial) => ({ ...partial, fontSize: Number(raw) }),
    });

    const newKey = settingsKey('t1', 'shell');
    localStorage.setItem(newKey, JSON.stringify({ fontSize: 13 }));
    localStorage.setItem(legacy('s1', 't1'), '99');

    const out = hydrateTileSettings<DemoSettings>(
      'shell',
      's1',
      't1',
      DEMO_DEFAULTS,
    );

    // New key wins; legacy key untouched.
    expect(out.fontSize).toBe(13);
    expect(localStorage.getItem(legacy('s1', 't1'))).toBe('99');
  });
});
