import { describe, expect, it } from 'vitest';
import {
  decodeSnapshot,
  encodeSnapshot,
  fitsInUrl,
  hasScripts,
  type DashboardSnapshot,
} from './dashboardShare';
import type { LayoutState } from '../types';

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

describe('fitsInUrl', () => {
  it('accepts small payloads and rejects huge ones', () => {
    expect(fitsInUrl('x'.repeat(100))).toBe(true);
    expect(fitsInUrl('x'.repeat(7000))).toBe(false);
  });
});
