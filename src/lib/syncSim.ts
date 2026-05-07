// In-memory Android filesystem used when `usingFake` is true.
//
// Mirrors the look-and-feel of the design reference at
// `design/v2/source/widget-files.jsx` — same canned dirs (sdcard,
// system, data, etc.), same plausible permissions and owners. The
// widget then drives the same SyncFs interface against this store.
//
// Pure: no React, no DOM, no global state. Test-friendly.

import type { SyncEntry } from './sync';

export interface SimFile {
  type: 'file';
  name: string;
  size: number;
  mtime: number;
  permission: number;
  /** Raw bytes for `read()`. Most files use the placeholder text below. */
  bytes?: Uint8Array;
}

export interface SimDir {
  type: 'dir';
  name: string;
  mtime: number;
  permission: number;
  children: SimNode[];
}

export interface SimLink {
  type: 'link';
  name: string;
  target: string;
  mtime: number;
  permission: number;
}

export type SimNode = SimFile | SimDir | SimLink;

const PLACEHOLDER_BYTES = new TextEncoder().encode(
  '(simulator placeholder — no real device contents)\n',
);

const PERM_DIR = 0o770;
const PERM_DIR_PUBLIC = 0o755;
const PERM_FILE = 0o660;
const PERM_FILE_RO = 0o644;
const PERM_LINK = 0o777;

function epoch(date: string): number {
  return Math.floor(new Date(date).getTime() / 1000);
}

function file(
  name: string,
  size: number,
  mtime: string,
  permission = PERM_FILE,
): SimFile {
  return { type: 'file', name, size, mtime: epoch(mtime), permission };
}

function dir(name: string, children: SimNode[], permission = PERM_DIR, mtime = '2024-12-12 09:42'): SimDir {
  return { type: 'dir', name, children, permission, mtime: epoch(mtime) };
}

function link(name: string, target: string, mtime = '2024-12-12 09:42'): SimLink {
  return { type: 'link', name, target, mtime: epoch(mtime), permission: PERM_LINK };
}

/** Produce a fresh tree. Each call returns a new mutable copy so
 *  mkdir on one widget instance doesn't bleed into others. */
export function buildSimFs(): SimDir {
  return dir(
    '/',
    [
      dir(
        'sdcard',
        [
          dir(
            'DCIM',
            [
              dir(
                'Camera',
                [
                  file('IMG_20241210_1042.jpg', 3_482_812, '2024-12-10 10:42'),
                  file('IMG_20241209_1812.jpg', 4_122_904, '2024-12-09 18:12'),
                  file('IMG_20241208_0930.jpg', 2_048_512, '2024-12-08 09:30'),
                ],
                PERM_DIR_PUBLIC,
                '2024-12-10 10:42',
              ),
            ],
            PERM_DIR_PUBLIC,
            '2024-12-12 09:42',
          ),
          dir(
            'Download',
            [
              file('invoice-202411.pdf', 184_320, '2024-11-30 16:22'),
              file('backup-config.json', 4_812, '2024-12-01 10:08'),
              file(
                'instrumentation-trace.perfetto',
                12_482_312,
                '2024-12-09 17:48',
              ),
              file('crash-report-2024-12-08.zip', 982_124, '2024-12-08 22:12'),
              file('RELEASE_NOTES.md', 8_212, '2024-12-11 08:05'),
            ],
            PERM_DIR_PUBLIC,
            '2024-12-11 08:05',
          ),
          dir(
            'Pictures',
            [
              dir(
                'Screenshots',
                [
                  file(
                    'Screenshot_2024-12-12_08-13-15.png',
                    312_000,
                    '2024-12-12 08:13',
                  ),
                  file(
                    'Screenshot_2024-12-11_14-02-08.png',
                    284_000,
                    '2024-12-11 14:02',
                  ),
                ],
                PERM_DIR_PUBLIC,
                '2024-12-12 08:13',
              ),
              dir('Wallpapers', [], PERM_DIR_PUBLIC, '2024-09-12 10:00'),
            ],
            PERM_DIR_PUBLIC,
            '2024-12-12 08:13',
          ),
        ],
        PERM_DIR_PUBLIC,
        '2024-12-12 09:42',
      ),
      dir(
        'system',
        [
          dir(
            'bin',
            [
              file('sh', 152_312, '2024-08-12 04:00', 0o755),
              file('ls', 84_192, '2024-08-12 04:00', 0o755),
              file('cat', 76_124, '2024-08-12 04:00', 0o755),
              file('toolbox', 218_120, '2024-08-12 04:00', 0o755),
            ],
            PERM_DIR_PUBLIC,
            '2024-08-12 04:00',
          ),
          dir(
            'etc',
            [
              file('hosts', 312, '2024-08-12 04:00', PERM_FILE_RO),
              file('system_fonts.xml', 18_482, '2024-08-12 04:00', PERM_FILE_RO),
            ],
            PERM_DIR_PUBLIC,
            '2024-08-12 04:00',
          ),
        ],
        PERM_DIR_PUBLIC,
        '2024-08-12 04:00',
      ),
      dir(
        'data',
        [
          dir(
            'local',
            [
              dir(
                'tmp',
                [
                  file('frida-server', 28_482_124, '2024-12-10 14:08', 0o777),
                  file('test-fixture.txt', 256, '2024-12-12 11:00', 0o644),
                ],
                0o777,
                '2024-12-12 11:00',
              ),
            ],
            PERM_DIR_PUBLIC,
            '2024-12-10 14:08',
          ),
        ],
        0o771,
        '2024-12-10 14:08',
      ),
      link('sdcard0', '/storage/emulated/0'),
      dir('proc', [], 0o555, '2024-08-12 04:00'),
      dir('dev', [], 0o755, '2024-08-12 04:00'),
    ],
    PERM_DIR_PUBLIC,
    '2024-12-12 09:42',
  );
}

// ---- Path helpers ---------------------------------------------------------

export function splitPath(path: string): string[] {
  return path.split('/').filter(Boolean);
}

export function simNodeAt(root: SimDir, path: string): SimNode | null {
  if (path === '/' || path === '') return root;
  let cur: SimNode = root;
  for (const seg of splitPath(path)) {
    if (cur.type !== 'dir') return null;
    const next: SimNode | undefined = cur.children.find((c) => c.name === seg);
    if (!next) return null;
    cur = next;
  }
  return cur;
}

export function simList(node: SimDir): SyncEntry[] {
  return node.children.map((c) => ({
    name: c.name,
    type: c.type,
    size: c.type === 'file' ? c.size : 0,
    mtime: c.mtime,
    permission: c.permission,
    linkTarget: c.type === 'link' ? c.target : null,
  }));
}

export function simRead(root: SimDir, path: string): Uint8Array {
  const node = simNodeAt(root, path);
  if (!node) throw new Error(`No such file or directory: ${path}`);
  if (node.type !== 'file') throw new Error(`Not a regular file: ${path}`);
  return node.bytes ?? PLACEHOLDER_BYTES;
}

/** Create directory + intermediate parents. Idempotent. */
export function simMkdir(root: SimDir, path: string): void {
  if (path === '/' || path === '') return;
  const segments = splitPath(path);
  let cur: SimDir = root;
  for (const seg of segments) {
    let next: SimNode | undefined = cur.children.find((c) => c.name === seg);
    if (!next) {
      const fresh: SimDir = dir(
        seg,
        [],
        PERM_DIR_PUBLIC,
        new Date().toISOString().slice(0, 16).replace('T', ' '),
      );
      cur.children.push(fresh);
      next = fresh;
    }
    if (next.type !== 'dir') {
      throw new Error(`Not a directory: ${seg}`);
    }
    cur = next;
  }
}

/**
 * Remove a node (file or directory subtree) from the sim tree. Mirror
 * of `rm -rf`: missing-target / root-path are no-ops; otherwise the
 * matching child is spliced out of its parent. Used by `SyncFs.remove`
 * in fake mode.
 */
export function simRemove(root: SimDir, path: string): void {
  if (path === '/' || path === '') return;
  const segments = splitPath(path);
  if (segments.length === 0) return;
  const last = segments[segments.length - 1];
  const parent = simNodeAt(root, '/' + segments.slice(0, -1).join('/'));
  if (!parent || parent.type !== 'dir') return;
  const idx = parent.children.findIndex((c) => c.name === last);
  if (idx >= 0) parent.children.splice(idx, 1);
}
