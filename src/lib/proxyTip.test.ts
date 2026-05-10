import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Minimal in-memory localStorage so the proxyTip helpers (which gate
// on `typeof localStorage === 'undefined'`) take their persistence
// path under vitest's default node env.
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
const g = globalThis as { localStorage?: Storage };
if (!g.localStorage) {
  g.localStorage = fakeLocalStorage as unknown as Storage;
}

import {
  isProxyTipDismissed,
  markProxyTipDismissed,
  resetProxyTipForTest,
} from './proxyTip';

describe('proxyTip storage', () => {
  beforeEach(() => resetProxyTipForTest());
  afterEach(() => resetProxyTipForTest());

  it('starts undismissed', () => {
    expect(isProxyTipDismissed()).toBe(false);
  });

  it('persists dismissal across reads', () => {
    markProxyTipDismissed();
    expect(isProxyTipDismissed()).toBe(true);
  });

  it('reset clears the dismissal', () => {
    markProxyTipDismissed();
    resetProxyTipForTest();
    expect(isProxyTipDismissed()).toBe(false);
  });
});
