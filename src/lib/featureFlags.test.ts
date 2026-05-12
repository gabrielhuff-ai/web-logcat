import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isWdpEnabled, resetFeatureFlagsForTest } from './featureFlags';

const store = new Map<string, string>();
const fakeLocalStorage = {
  getItem: (k: string) => (store.has(k) ? (store.get(k) ?? null) : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() {
    return store.size;
  },
};

const g = globalThis as {
  localStorage?: Storage;
  window?: {
    location: { search: string; pathname: string; hash: string };
    history: { replaceState: (s: unknown, t: string, u: string) => void };
  };
};

let lastReplacedUrl = '';

beforeEach(() => {
  store.clear();
  resetFeatureFlagsForTest();
  lastReplacedUrl = '';
  g.localStorage = fakeLocalStorage as unknown as Storage;
  g.window = {
    location: { search: '', pathname: '/', hash: '' },
    history: {
      replaceState: (_s, _t, u) => {
        lastReplacedUrl = u;
      },
    },
  };
});

afterEach(() => {
  delete g.window;
});

describe('isWdpEnabled', () => {
  it('returns false by default', () => {
    expect(isWdpEnabled()).toBe(false);
  });

  it('returns true when localStorage has the flag', () => {
    store.set('weblogcat:flags:wdp:v1', '1');
    expect(isWdpEnabled()).toBe(true);
  });

  it('enables and sticks when ?wdp=1 is present', () => {
    g.window!.location.search = '?wdp=1';
    expect(isWdpEnabled()).toBe(true);
    expect(store.get('weblogcat:flags:wdp:v1')).toBe('1');
    // URL param stripped from history.
    expect(lastReplacedUrl).toBe('/');
  });

  it('clears the flag when ?wdp=0 is present', () => {
    store.set('weblogcat:flags:wdp:v1', '1');
    g.window!.location.search = '?wdp=0';
    expect(isWdpEnabled()).toBe(false);
    expect(store.has('weblogcat:flags:wdp:v1')).toBe(false);
  });

  it('preserves other query params when stripping ?wdp', () => {
    g.window!.location.search = '?d=abc&wdp=1';
    expect(isWdpEnabled()).toBe(true);
    expect(lastReplacedUrl).toBe('/?d=abc');
  });

  it('caches the result across calls within the same page load', () => {
    g.window!.location.search = '?wdp=1';
    expect(isWdpEnabled()).toBe(true);
    // Even if the storage is cleared mid-life, cached value wins.
    store.clear();
    expect(isWdpEnabled()).toBe(true);
  });
});
