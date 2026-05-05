import { describe, expect, it } from 'vitest';
import { createSync, PROGRESS_THRESHOLD, type WriteProgress } from './sync';

// All assertions target the simulator path — `createSync(null)` —
// because the real path requires a live ADB transport. Phase 6 set the
// precedent: pure logic gets Vitest coverage; real-hardware code paths
// stay manual against the deployed staging URL.

describe('createSync (simulator)', () => {
  it('builds a `usingFake` SyncFs when adb is null', () => {
    const fs = createSync(null);
    expect(fs.usingFake).toBe(true);
  });

  it('lists the canned filesystem root', async () => {
    const fs = createSync(null);
    const entries = await fs.list('/');
    const names = entries.map((e) => e.name).sort();
    expect(names).toEqual(['data', 'dev', 'proc', 'sdcard', 'sdcard0', 'system']);
  });

  it('lists Download with the expected shape', async () => {
    const fs = createSync(null);
    const entries = await fs.list('/sdcard/Download');
    const invoice = entries.find((e) => e.name === 'invoice-202411.pdf');
    expect(invoice).toBeDefined();
    expect(invoice?.type).toBe('file');
    expect(invoice?.size).toBe(184_320);
    expect(invoice?.permission).toBeGreaterThan(0);
  });

  it('flags symlinks via type and exposes the target', async () => {
    const fs = createSync(null);
    const entries = await fs.list('/');
    const link = entries.find((e) => e.name === 'sdcard0');
    expect(link?.type).toBe('link');
    expect(link?.linkTarget).toBe('/storage/emulated/0');
  });

  it('throws on missing paths', async () => {
    const fs = createSync(null);
    await expect(fs.list('/sdcard/does-not-exist')).rejects.toThrow();
  });

  it('throws when listing a non-directory', async () => {
    const fs = createSync(null);
    await expect(fs.list('/sdcard/Download/invoice-202411.pdf')).rejects.toThrow(
      /Not a directory/,
    );
  });

  it('reads a file via a single-chunk stream', async () => {
    const fs = createSync(null);
    const stream = fs.read('/sdcard/Download/RELEASE_NOTES.md');
    const reader = stream.getReader();
    const { value, done } = await reader.read();
    expect(done).toBe(false);
    expect(value).toBeInstanceOf(Uint8Array);
    expect(value!.byteLength).toBeGreaterThan(0);
    const tail = await reader.read();
    expect(tail.done).toBe(true);
  });

  it('mkdir creates intermediate directories and is idempotent', async () => {
    const fs = createSync(null);
    await fs.mkdir('/sdcard/MkdirTest/nested');
    const top = await fs.list('/sdcard');
    expect(top.some((e) => e.name === 'MkdirTest')).toBe(true);
    const inner = await fs.list('/sdcard/MkdirTest');
    expect(inner.some((e) => e.name === 'nested')).toBe(true);
    // Idempotent — calling again is fine.
    await fs.mkdir('/sdcard/MkdirTest/nested');
  });

  it('write drains the stream and fires onProgress when total >= threshold', async () => {
    const fs = createSync(null);
    const big = new Uint8Array(PROGRESS_THRESHOLD + 1024);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(big);
        controller.close();
      },
    });

    const events: WriteProgress[] = [];
    await fs.write('/sdcard/Download/whatever.bin', stream, {
      total: big.byteLength,
      onProgress: (p) => events.push(p),
    });
    expect(events.length).toBeGreaterThan(0);
    const last = events[events.length - 1];
    expect(last.bytes).toBe(big.byteLength);
    expect(last.total).toBe(big.byteLength);
  });

  it('write skips progress callbacks for small files (<1MB)', async () => {
    const fs = createSync(null);
    const small = new Uint8Array(1024);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(small);
        controller.close();
      },
    });

    const events: WriteProgress[] = [];
    await fs.write('/sdcard/Download/tiny.bin', stream, {
      total: small.byteLength,
      onProgress: (p) => events.push(p),
    });
    expect(events.length).toBe(0);
  });

  it('dispose is a no-op on the simulator', async () => {
    const fs = createSync(null);
    await expect(fs.dispose()).resolves.toBeUndefined();
  });
});
