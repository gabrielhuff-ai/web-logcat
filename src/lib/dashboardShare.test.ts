import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  applySnapshot,
  captureSnapshot,
  decodeSnapshot,
  encodeSnapshot,
  fitsInUrl,
  hasScripts,
  isSnapshotTrusted,
  linkMayBeTruncated,
  markSnapshotTrusted,
  snapshotHash,
  snapshotsEqual,
  type DashboardSnapshot,
} from './dashboardShare';
import { STORAGE_KEY } from './layout';
import { settingsKey } from './tileSettings';
import type { LayoutState } from '../types';

// Vitest under node has no DOM globals — install a minimal localStorage
// shim once for every test in this file. Idempotent: each inner describe's
// own `beforeAll` bails when localStorage is already present.
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

const layout: LayoutState = {
  tiles: { a: { id: 'a', kind: 'scripting' } },
  tree: { type: 'leaf', id: 'a' },
  focusId: 'a',
};

const snap = (script: string): DashboardSnapshot => ({
  v: 1,
  layout,
  settings: { a: { scripting: { script, runAsRoot: false, controls: [], fontSize: 12 } } },
});

describe('encode/decode roundtrip', () => {
  it('survives a full round trip', async () => {
    const s = snap('force_stop() {\n  am force-stop "$PKG"\n}');
    const encoded = await encodeSnapshot(s);
    const decoded = await decodeSnapshot(encoded);
    expect(decoded).toEqual(s);
  });

  it('returns null for malformed input', async () => {
    expect(await decodeSnapshot('')).toBeNull();
    expect(await decodeSnapshot('not-a-snapshot')).toBeNull();
    expect(await decodeSnapshot('Zgarbage')).toBeNull();
  });

  it('rejects a payload that is not a v1 snapshot', async () => {
    // 'B' codec carrying valid JSON that isn't a snapshot.
    const bytes = new TextEncoder().encode(JSON.stringify({ hello: 'world' }));
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    const body = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(await decodeSnapshot('B' + body)).toBeNull();
  });
});

describe('hasScripts', () => {
  it('is true when a scripting panel has real code', () => {
    expect(hasScripts(snap('echo hi'))).toBe(true);
  });
  it('is false for comment-only / empty scripts', () => {
    expect(hasScripts(snap('# just a comment\n\n'))).toBe(false);
  });
});

describe('applySnapshot', () => {
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

  beforeEach(() => {
    localStorage.clear();
  });

  it('preserves daemon auto-start and readout auto-poll — the trust gate is the UI ack, not silent stripping', () => {
    const scripting = {
      script: 'tail_logs() { logcat; }',
      runAsRoot: false,
      fontSize: 12,
      controls: [
        { id: 'd', kind: 'readout', boundTo: 'temp', autoPoll: { enabled: true, intervalSec: 3 }, refreshOnChange: false },
        { id: 'b', kind: 'daemon', label: 'Watch', autoStart: true, bindOutputTo: 'console' },
      ],
    };
    const s: DashboardSnapshot = {
      v: 1,
      layout: {
        tiles: { a: { id: 'a', kind: 'scripting' } },
        tree: { type: 'leaf', id: 'a' },
        focusId: 'a',
      },
      settings: { a: { scripting } },
    };

    applySnapshot(s);
    const stored = JSON.parse(localStorage.getItem(settingsKey('a', 'scripting')) ?? '{}');
    expect(stored).toEqual(scripting);
  });
});

describe('captureSnapshot', () => {
  // Vitest under node has no DOM globals — install a minimal localStorage
  // shim so `captureSnapshot` can read its keys. Mirrors `tileSettings.test.ts`.
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

  beforeEach(() => {
    localStorage.clear();
  });

  it('only includes settings for tiles that exist in the current layout', () => {
    const live: LayoutState = {
      tiles: { live: { id: 'live', kind: 'shell' } },
      tree: { type: 'leaf', id: 'live' },
      focusId: 'live',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(live));
    localStorage.setItem(settingsKey('live', 'shell'), JSON.stringify({ cwd: '/data' }));
    localStorage.setItem(settingsKey('orphan', 'scripting'), JSON.stringify({ script: 'rm -rf /' }));

    const snap = captureSnapshot();
    expect(Object.keys(snap.settings)).toEqual(['live']);
    expect(snap.settings.live).toEqual({ shell: { cwd: '/data' } });
  });

  it('produces an empty settings map for a cleared dashboard, even with orphaned keys', () => {
    const empty: LayoutState = { tiles: {}, tree: null, focusId: null };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(empty));
    localStorage.setItem(settingsKey('w1', 'scripting'), JSON.stringify({ script: 'echo hi' }));
    localStorage.setItem(settingsKey('w2', 'logcat'), JSON.stringify({ filters: ['ActivityManager'] }));

    const snap = captureSnapshot();
    expect(snap.layout).toEqual(empty);
    expect(snap.settings).toEqual({});
  });
});

describe('snapshotsEqual', () => {
  const base: DashboardSnapshot = {
    v: 1,
    layout: {
      tiles: { a: { id: 'a', kind: 'scripting' }, b: { id: 'b', kind: 'shell' } },
      tree: { type: 'split', dir: 'row', ratio: 0.5, a: { type: 'leaf', id: 'a' }, b: { type: 'leaf', id: 'b' } },
      focusId: 'a',
    },
    settings: {
      a: { scripting: { script: 'echo hi', controls: [] } },
      b: { shell: { cwd: '/data' } },
    },
  };

  it('is true for two snapshots with the same content', () => {
    expect(snapshotsEqual(base, JSON.parse(JSON.stringify(base)) as DashboardSnapshot)).toBe(true);
  });

  it('is true when only object key ordering differs', () => {
    const reordered: DashboardSnapshot = {
      settings: {
        b: { shell: { cwd: '/data' } },
        a: { scripting: { controls: [], script: 'echo hi' } },
      },
      layout: base.layout,
      v: 1,
    };
    expect(snapshotsEqual(base, reordered)).toBe(true);
  });

  it('is false when settings differ', () => {
    const changed: DashboardSnapshot = {
      ...base,
      settings: { ...base.settings, a: { scripting: { script: 'echo hello', controls: [] } } },
    };
    expect(snapshotsEqual(base, changed)).toBe(false);
  });

  it('is false when the layout tree differs', () => {
    const changed: DashboardSnapshot = {
      ...base,
      layout: { ...base.layout, focusId: 'b' },
    };
    expect(snapshotsEqual(base, changed)).toBe(false);
  });
});

describe('fitsInUrl', () => {
  it('accepts payloads up to the hard limit and rejects above it', () => {
    expect(fitsInUrl('x'.repeat(100))).toBe(true);
    // Used to reject at 6 KB — we now allow up to ~30 KB.
    expect(fitsInUrl('x'.repeat(7_000))).toBe(true);
    expect(fitsInUrl('x'.repeat(29_999))).toBe(true);
    expect(fitsInUrl('x'.repeat(30_001))).toBe(false);
  });
});

describe('snapshotHash + trust list', () => {
  const base: DashboardSnapshot = {
    v: 1,
    layout: {
      tiles: { a: { id: 'a', kind: 'scripting' } },
      tree: { type: 'leaf', id: 'a' },
      focusId: 'a',
    },
    settings: { a: { scripting: { script: 'echo hi', controls: [] } } },
  };

  beforeEach(() => {
    localStorage.clear();
  });

  it('hashes deterministically — same content, same hash', async () => {
    const h1 = await snapshotHash(base);
    const h2 = await snapshotHash(JSON.parse(JSON.stringify(base)) as DashboardSnapshot);
    expect(h1).toEqual(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is insensitive to key ordering — matches the equality contract', async () => {
    const reordered: DashboardSnapshot = {
      settings: { a: { scripting: { controls: [], script: 'echo hi' } } },
      layout: base.layout,
      v: 1,
    };
    expect(await snapshotHash(reordered)).toEqual(await snapshotHash(base));
  });

  it('differs when content differs', async () => {
    const changed: DashboardSnapshot = {
      ...base,
      settings: { a: { scripting: { script: 'echo bye', controls: [] } } },
    };
    expect(await snapshotHash(changed)).not.toEqual(await snapshotHash(base));
  });

  it('round-trips through the trust list', async () => {
    const h = await snapshotHash(base);
    expect(isSnapshotTrusted(h)).toBe(false);
    markSnapshotTrusted(h);
    expect(isSnapshotTrusted(h)).toBe(true);
  });

  it('FIFO-evicts the oldest entry past the cap, and re-marking refreshes recency', () => {
    // Cap is 50 — fill past it and confirm the early entries are evicted.
    for (let i = 0; i < 55; i++) markSnapshotTrusted(`hash-${i.toString().padStart(2, '0')}`);
    expect(isSnapshotTrusted('hash-00')).toBe(false);
    expect(isSnapshotTrusted('hash-04')).toBe(false);
    expect(isSnapshotTrusted('hash-05')).toBe(true);
    expect(isSnapshotTrusted('hash-54')).toBe(true);

    // Re-marking an existing hash moves it to the most-recent slot,
    // so it survives subsequent eviction.
    markSnapshotTrusted('hash-05');
    for (let i = 100; i < 110; i++) markSnapshotTrusted(`hash-${i}`);
    expect(isSnapshotTrusted('hash-05')).toBe(true);
    expect(isSnapshotTrusted('hash-06')).toBe(false);
  });
});

describe('linkMayBeTruncated', () => {
  it('flags payloads between the soft and hard limits', () => {
    expect(linkMayBeTruncated('x'.repeat(100))).toBe(false);
    expect(linkMayBeTruncated('x'.repeat(6_000))).toBe(false);
    expect(linkMayBeTruncated('x'.repeat(6_001))).toBe(true);
    expect(linkMayBeTruncated('x'.repeat(29_999))).toBe(true);
    // Above the hard limit the link isn't offered at all, so the
    // truncation note is irrelevant — return false to match UI semantics.
    expect(linkMayBeTruncated('x'.repeat(30_001))).toBe(false);
  });
});
