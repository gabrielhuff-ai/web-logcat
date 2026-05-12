// Tests for WdpAdbTransport. We only assert the shape contract here —
// the actual /adb-json socket plumbing is covered in adbSocket.test.ts.

import { describe, expect, it } from 'vitest';
import { WdpAdbTransport } from './transport';

describe('WdpAdbTransport', () => {
  it('seeds the AdbBanner from adbProps', () => {
    const t = new WdpAdbTransport({
      serialNumber: 'serial-abc',
      adbProps: {
        'ro.product.name': 'panther',
        'ro.product.model': 'Pixel 7',
        'ro.product.device': 'panther',
      },
    });
    expect(t.serial).toBe('serial-abc');
    expect(t.banner.product).toBe('panther');
    expect(t.banner.model).toBe('Pixel 7');
    expect(t.banner.device).toBe('panther');
  });

  it('rejects reverse-tunnel calls (WDP does not expose them)', async () => {
    const t = new WdpAdbTransport({ serialNumber: 's' });
    await expect(t.addReverseTunnel()).rejects.toThrow(/Reverse tunnels/);
  });

  it('resolves disconnected on close()', async () => {
    const t = new WdpAdbTransport({ serialNumber: 's' });
    let done = false;
    void t.disconnected.then(() => {
      done = true;
    });
    await t.close();
    await Promise.resolve();
    expect(done).toBe(true);
  });

  it('advertises the modern feature set', () => {
    const t = new WdpAdbTransport({ serialNumber: 's' });
    expect(t.clientFeatures).toContain('shell_v2');
    expect(t.clientFeatures).toContain('sendrecv_v2');
    expect(t.clientFeatures).toContain('cmd');
  });
});
