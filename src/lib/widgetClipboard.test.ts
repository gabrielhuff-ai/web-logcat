import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  clearWidgetClip,
  copyTileToClipboard,
  getWidgetClip,
  seedTileSettings,
} from './widgetClipboard';
import { settingsKey } from './tileSettings';

// Vitest runs under node with no DOM globals — install a minimal in-memory
// localStorage shim (mirrors tileSettings.test.ts) before any code touches it.
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
  clearWidgetClip();
});
afterEach(() => {
  localStorage.clear();
  clearWidgetClip();
});

describe('widgetClipboard', () => {
  it('starts empty', () => {
    expect(getWidgetClip()).toBeNull();
  });

  it('copies a tile with its persisted settings', () => {
    const cfg = { filters: ['tag:Foo'], wrap: true };
    localStorage.setItem(settingsKey('w_lc_1', 'logcat'), JSON.stringify(cfg));

    copyTileToClipboard('w_lc_1', 'logcat');

    const clip = getWidgetClip();
    expect(clip).toEqual({ kind: 'logcat', settings: cfg });
  });

  it('copies a tile that has no settings yet as null settings', () => {
    copyTileToClipboard('w_sh_1', 'shell');
    expect(getWidgetClip()).toEqual({ kind: 'shell', settings: null });
  });

  it('snapshots settings at copy time — later edits to the source do not leak', () => {
    localStorage.setItem(settingsKey('w_lc_1', 'logcat'), JSON.stringify({ wrap: false }));
    copyTileToClipboard('w_lc_1', 'logcat');
    // Mutate the source after copying.
    localStorage.setItem(settingsKey('w_lc_1', 'logcat'), JSON.stringify({ wrap: true }));
    expect(getWidgetClip()?.settings).toEqual({ wrap: false });
  });

  it('seeds a new tile under its own key so a clone hydrates configured', () => {
    const cfg = { script: 'echo hi', controls: [] };
    seedTileSettings('w_new', 'scripting', cfg);
    expect(JSON.parse(localStorage.getItem(settingsKey('w_new', 'scripting'))!)).toEqual(cfg);
  });

  it('round-trips copy → seed into a fresh tile id', () => {
    const cfg = { runAsRoot: true, controls: [{ id: 'x', kind: 'section', title: 'T' }] };
    localStorage.setItem(settingsKey('src', 'scripting'), JSON.stringify(cfg));
    copyTileToClipboard('src', 'scripting');

    const clip = getWidgetClip()!;
    seedTileSettings('dst', clip.kind, clip.settings!);

    expect(JSON.parse(localStorage.getItem(settingsKey('dst', 'scripting'))!)).toEqual(cfg);
  });

  it('ignores malformed source settings (treats them as none)', () => {
    localStorage.setItem(settingsKey('w_bad', 'dumpsys'), '{not json');
    copyTileToClipboard('w_bad', 'dumpsys');
    expect(getWidgetClip()).toEqual({ kind: 'dumpsys', settings: null });
  });

  it('persists the clip in shared storage so another tab can read it', () => {
    localStorage.setItem(settingsKey('w_lc_1', 'logcat'), JSON.stringify({ wrap: true }));
    copyTileToClipboard('w_lc_1', 'logcat');
    // The clip lives in localStorage (shared across same-origin tabs), not an
    // in-memory variable — so it's actually present under the slot key.
    expect(localStorage.getItem('weblogcat:widgetClip')).toBeTruthy();
  });

  it('reads a clip another tab wrote to the shared slot', () => {
    // Simulate a copy that happened in a different tab by writing the slot
    // directly; getWidgetClip in "this tab" still resolves it.
    localStorage.setItem(
      'weblogcat:widgetClip',
      JSON.stringify({ kind: 'shell', settings: { cwd: '/data/local/tmp' } }),
    );
    expect(getWidgetClip()).toEqual({ kind: 'shell', settings: { cwd: '/data/local/tmp' } });
  });

  it('ignores a malformed clip in the shared slot', () => {
    localStorage.setItem('weblogcat:widgetClip', '{broken');
    expect(getWidgetClip()).toBeNull();
  });

  it('clearWidgetClip empties the shared slot', () => {
    copyTileToClipboard('w_x', 'files');
    expect(getWidgetClip()).not.toBeNull();
    clearWidgetClip();
    expect(getWidgetClip()).toBeNull();
  });
});
