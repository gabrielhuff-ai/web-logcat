// Files widget — two-column file browser scoped to one tile.
//
// Toolbar (`fx-toolbar widget-bar`): back / forward / up / refresh /
// new-folder / Push / Pull / breadcrumb. Tree pane (220px, rooted at
// `/`). List pane: sortable by name / size / modified / perms;
// multi-select with Shift / Ctrl. Drag-out → Pull (download), drag-in
// → Push (upload).
//
// Two backends, switched on `useAdb().usingFake`:
//   - Real device → `createSync(adb)` wraps `adb.sync()`. mkdir runs
//     over the shell channel because the sync protocol doesn't expose
//     it — same workaround the upstream Tango demo uses.
//   - Simulator   → `createSync(null)` returns the in-memory tree from
//     `lib/syncSim.ts`. Push is no-op'd with a toast in fake mode (per
//     the ShellWidget precedent — surface clearly that this isn't real).
//
// Per-tile persistence: current path lives under
//   `weblogcat:files:<serial>:<tileId>:cwd`
// matching the WIDGETS.md namespace convention.

import '../../styles/widgets/files.css';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties } from 'react';
import { ConfirmDialog, PromptDialog } from '../ConfirmDialog';
import * as Icons from '../Icons';
import { useAdb } from '../../lib/adbContext';
import { useDashboardChrome } from '../../lib/dashboardChrome';
import { useTileSettings } from '../../lib/tileSettings';
import {
  createSync,
  PROGRESS_THRESHOLD,
  type SyncEntry,
  type SyncFs,
  type WriteProgress,
} from '../../lib/sync';
import { FILES_DEFAULTS, type FilesSettings } from './files/filesSettings';

export interface FilesWidgetProps {
  /** Stable id of the host tile — used to namespace per-instance state. */
  tileId: string;
}

type SortKey = 'name' | 'size' | 'mtime' | 'perms';
type SortDir = 'asc' | 'desc';

interface Transfer {
  kind: 'push' | 'pull';
  name: string;
  bytes: number;
  total: number | null;
  done: boolean;
}

const ROOT = '/';

export function FilesWidget({ tileId }: FilesWidgetProps) {
  const { adb, usingFake } = useAdb();
  const { showToast } = useDashboardChrome();
  const [settings, setSettings] = useTileSettings<FilesSettings>(
    tileId,
    'files',
    FILES_DEFAULTS,
  );

  // One SyncFs per widget instance — created lazily on first render and
  // disposed on unmount. The simulator path is synchronous; the real
  // path opens its `adb.sync()` socket on the first call.
  const fsRef = useRef<SyncFs | null>(null);
  if (fsRef.current === null) {
    fsRef.current = createSync(usingFake ? null : adb);
  }
  // If the connect mode flips (fake → real or vice versa) the parent
  // re-mounts the dashboard, so this widget unmounts cleanly. We don't
  // try to swap backends in-place.

  // Live cwd seeds from the configured starting path. The widget keeps
  // the persisted starting path in sync with the live cwd as the user
  // navigates so a reload returns them where they left off.
  const [path, setPath] = useState<string>(() => settings.startingPath);
  // Back/forward stacks. The current path is the top of `back`; when
  // the user clicks back we pop into `forward` and vice versa.
  const [back, setBack] = useState<string[]>([]);
  const [forward, setForward] = useState<string[]>([]);

  const [entries, setEntries] = useState<SyncEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const lastClickedRef = useRef<string | null>(null);

  // Live right-click context menu. Anchored at the click position; the
  // entry is captured at open time so the menu actions don't depend on
  // the selection drifting underneath. `null` = closed.
  interface ContextMenuState {
    x: number;
    y: number;
    entry: SyncEntry;
  }
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [showHidden, setShowHidden] = useState(false);

  const [transfer, setTransfer] = useState<Transfer | null>(null);
  // Name of the APK currently being installed, or null. Drives the
  // indeterminate progress strip that mirrors the push / pull
  // transfer rail. `pm install` blocks for 5–30 s so without an
  // in-progress affordance the click feels like a no-op.
  const [installing, setInstalling] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  // Dialog state — replaces window.confirm / window.prompt with the
  // material-style overlays defined in `ConfirmDialog.tsx`.
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);

  // Tree pane owns its own expanded set so opening a directory in the
  // list pane doesn't auto-expand the tree (matches Finder / VS Code).
  const [treeExpanded, setTreeExpanded] = useState<Set<string>>(
    () => new Set(['/']),
  );
  const [treeChildren, setTreeChildren] = useState<Map<string, SyncEntry[]>>(
    () => new Map(),
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const treeScrollRef = useRef<HTMLDivElement | null>(null);

  // ---- List load + reload ------------------------------------------------
  const reload = useCallback(async () => {
    const fs = fsRef.current;
    if (!fs) return;
    setLoading(true);
    setError(null);
    try {
      const list = await fs.list(path);
      setEntries(list);
      setSelected(new Set());
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to list directory';
      setError(msg);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Persist current cwd back into settings so reload restores the
  // last-visited directory. We track the last-pushed value in a ref to
  // tell apart "user navigated" (write back to settings) from "modal
  // changed startingPath" (navigate to it). Without that distinction
  // we'd ping-pong between the two writes on every keystroke in the
  // modal's text input.
  const lastPushedPathRef = useRef(path);
  useEffect(() => {
    if (path !== lastPushedPathRef.current) {
      lastPushedPathRef.current = path;
      if (path !== settings.startingPath) {
        setSettings({ startingPath: path });
      }
    } else if (settings.startingPath !== path && settings.startingPath.startsWith('/')) {
      lastPushedPathRef.current = settings.startingPath;
      setPath(settings.startingPath);
    }
  }, [path, settings.startingPath, setSettings]);

  // ---- Tree pane lazy-load ------------------------------------------------
  const loadTreeChildren = useCallback(async (dirPath: string) => {
    const fs = fsRef.current;
    if (!fs) return;
    if (treeChildrenRef.current.has(dirPath)) return;
    try {
      const list = await fs.list(dirPath);
      setTreeChildren((prev) => {
        const next = new Map(prev);
        next.set(
          dirPath,
          list
            // Hide `.` / `..` (the synthetic entries Linux readdir
            // returns for self / parent — they're not useful in a
            // tree view) and keep only actual directories. Sort
            // alphabetically so the tree is browsable instead of
            // appearing in inode order.
            .filter(
              (e) => e.type === 'dir' && e.name !== '.' && e.name !== '..',
            )
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
        return next;
      });
    } catch {
      // Permission-denied directories are common (`/data` on user
      // builds, `/dev/*`). Stash an empty list so we don't retry.
      setTreeChildren((prev) => {
        const next = new Map(prev);
        next.set(dirPath, []);
        return next;
      });
    }
  }, []);
  // Mirror the ref so loadTreeChildren can avoid a stale-closure check.
  const treeChildrenRef = useRef(treeChildren);
  useEffect(() => {
    treeChildrenRef.current = treeChildren;
  }, [treeChildren]);

  // Auto-expand root on mount.
  useEffect(() => {
    void loadTreeChildren(ROOT);
  }, [loadTreeChildren]);

  // Auto-expand the ancestors of `path` so the tree shows where we
  // are. Walks `/`, `/sdcard`, `/sdcard/Download`, ... — but
  // intentionally stops one level short so the *current* directory
  // doesn't auto-expand. Otherwise arrow-down navigation in the tree
  // would unfold every directory it walks past.
  useEffect(() => {
    if (path === '/') return;
    const parts = path.split('/').filter(Boolean);
    const ancestors: string[] = ['/'];
    let acc = '';
    // Stop at parts.length - 1 so `path` itself is not added.
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc + '/' + parts[i];
      ancestors.push(acc);
    }
    setTreeExpanded((prev) => {
      const next = new Set(prev);
      for (const a of ancestors) next.add(a);
      return next;
    });
    for (const a of ancestors) void loadTreeChildren(a);
  }, [path, loadTreeChildren]);

  // ---- Navigation --------------------------------------------------------
  const navigate = useCallback(
    (next: string) => {
      if (next === path) return;
      setBack((b) => [...b, path]);
      setForward([]);
      setPath(next);
    },
    [path],
  );
  const goBack = useCallback(() => {
    setBack((b) => {
      if (b.length === 0) return b;
      const prev = b[b.length - 1];
      setForward((f) => [path, ...f]);
      setPath(prev);
      return b.slice(0, -1);
    });
  }, [path]);
  const goForward = useCallback(() => {
    setForward((f) => {
      if (f.length === 0) return f;
      const [head, ...rest] = f;
      setBack((b) => [...b, path]);
      setPath(head);
      return rest;
    });
  }, [path]);
  const goUp = useCallback(() => {
    if (path === '/') return;
    const parts = path.split('/').filter(Boolean);
    parts.pop();
    navigate(parts.length ? '/' + parts.join('/') : '/');
  }, [path, navigate]);

  // ---- Sorted, filtered view ---------------------------------------------
  const sorted = useMemo(() => {
    const list = entries.filter((e) => showHidden || !e.name.startsWith('.'));
    list.sort((a, b) => {
      // Dirs first, then links, then files.
      if (a.type !== b.type) {
        const order = { dir: 0, link: 1, file: 2 } as const;
        return order[a.type] - order[b.type];
      }
      let cmp = 0;
      if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortBy === 'size') cmp = a.size - b.size;
      else if (sortBy === 'mtime') cmp = a.mtime - b.mtime;
      else if (sortBy === 'perms') cmp = a.permission - b.permission;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [entries, showHidden, sortBy, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortBy) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(key);
      setSortDir('asc');
    }
  };

  // ---- Selection ---------------------------------------------------------
  const onRowClick = useCallback(
    (e: React.MouseEvent, name: string) => {
      const visible = sorted.map((s) => s.name);
      setSelected((prev) => {
        const next = new Set(prev);
        if (e.shiftKey && lastClickedRef.current) {
          const a = visible.indexOf(lastClickedRef.current);
          const b = visible.indexOf(name);
          if (a !== -1 && b !== -1) {
            next.clear();
            const [lo, hi] = a < b ? [a, b] : [b, a];
            for (let i = lo; i <= hi; i++) next.add(visible[i]);
            return next;
          }
        }
        if (e.ctrlKey || e.metaKey) {
          if (next.has(name)) next.delete(name);
          else next.add(name);
        } else {
          next.clear();
          next.add(name);
        }
        return next;
      });
      lastClickedRef.current = name;
    },
    [sorted],
  );
  const openOnDevice = useCallback(
    async (entry: SyncEntry) => {
      const fs = fsRef.current;
      if (!fs) return;
      const target =
        entry.type === 'link' && entry.linkTarget
          ? entry.linkTarget
          : joinPath(path, entry.name);
      const isApk = target.toLowerCase().endsWith('.apk');
      // `fs.open` now blocks until `pm install` (or `am start`) has
      // exited — see the matching code in lib/sync.ts. Show the same
      // indeterminate progress strip we use for push / pull during
      // the wait, so the user has a visible signal that something is
      // happening during the 5–30 s install window.
      if (isApk) setInstalling(entry.name);
      const res = await fs.open(target);
      if (isApk) setInstalling(null);
      if (res.ok) {
        showToast(
          isApk
            ? `Installed ${entry.name}`
            : `Opened ${entry.name} on device`,
        );
      } else {
        // pm install / am start error messages can be hundreds of
        // chars (full Java stack traces) — useless in a toast and
        // they bury the dashboard chrome. Keep the toast short and
        // generic; log the full reason to the console for anyone
        // debugging.
        console.error(`[Files] open failed for ${target}:`, res.reason);
        showToast(
          isApk
            ? `Install failed for ${entry.name}`
            : `Open failed for ${entry.name}`,
        );
      }
    },
    [path, showToast],
  );

  const onRowDouble = (entry: SyncEntry) => {
    if (entry.type === 'dir') {
      navigate(joinPath(path, entry.name));
      return;
    }
    if (entry.type === 'link' && entry.linkTarget) {
      // Symlinks: probe with `list()` to determine if the target is a
      // directory. The previous `endsWith('/')` heuristic was wrong
      // for the common `/sdcard → /storage/self/primary` case where
      // the resolved path has no trailing slash. We resolve to the
      // link's target rather than navigating into the link's source
      // path so the breadcrumb reflects the real device location.
      const target = entry.linkTarget;
      void (async () => {
        const fs = fsRef.current;
        if (!fs) return;
        try {
          await fs.list(target);
          navigate(target);
        } catch {
          // Not a directory — fall back to the device's default
          // viewer for the link target.
          void openOnDevice(entry);
        }
      })();
      return;
    }
    // Plain file → ask the device to open it with its default app.
    void openOnDevice(entry);
  };

  // ---- Push (upload) -----------------------------------------------------
  const pushFile = useCallback(
    async (file: File) => {
      const fs = fsRef.current;
      if (!fs) return;
      if (fs.usingFake) {
        showToast(`Fake mode: ${file.name} not pushed`);
        return;
      }
      const target = joinPath(path, file.name);
      setTransfer({
        kind: 'push',
        name: file.name,
        bytes: 0,
        total: file.size,
        done: false,
      });
      try {
        await fs.write(target, file.stream(), {
          total: file.size,
          onProgress: (p: WriteProgress) => {
            setTransfer((cur) =>
              cur && cur.kind === 'push' && cur.name === file.name
                ? { ...cur, bytes: p.bytes, total: p.total }
                : cur,
            );
          },
        });
        setTransfer((cur) =>
          cur && cur.kind === 'push' && cur.name === file.name
            ? { ...cur, done: true, bytes: cur.total ?? cur.bytes }
            : cur,
        );
        setTimeout(() => {
          setTransfer((cur) =>
            cur && cur.kind === 'push' && cur.name === file.name && cur.done ? null : cur,
          );
        }, 1100);
        await reload();
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Push failed';
        showToast(msg);
        setTransfer(null);
      }
    },
    [path, reload, showToast],
  );

  const onChooseFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      void pushFile(file);
    },
    [pushFile],
  );

  // ---- Pull (download) ---------------------------------------------------
  const pullFile = useCallback(
    async (entryName: string) => {
      const fs = fsRef.current;
      if (!fs) return;
      const entry = entries.find((e) => e.name === entryName);
      if (!entry || entry.type !== 'file') return;
      if (fs.usingFake) {
        showToast(`Fake mode: ${entryName} not pulled`);
        return;
      }
      setTransfer({
        kind: 'pull',
        name: entryName,
        bytes: 0,
        total: entry.size,
        done: false,
      });
      try {
        const remote = joinPath(path, entryName);
        const stream = fs.read(remote);
        // Drain into a Blob, then trigger a browser download. We
        // accumulate progress as we read so files >1MB show a bar.
        const chunks: Uint8Array[] = [];
        const reader = stream.getReader();
        let bytes = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            bytes += value.byteLength;
            if (entry.size >= PROGRESS_THRESHOLD) {
              setTransfer((cur) =>
                cur && cur.kind === 'pull' && cur.name === entryName
                  ? { ...cur, bytes }
                  : cur,
              );
            }
          }
        }
        // Cast to BlobPart[]: TS chokes on Uint8Array<ArrayBufferLike>
        // vs the BlobPart's Uint8Array<ArrayBuffer>, but the runtime
        // shape is identical. Web Streams give us back the former.
        const blob = new Blob(chunks as unknown as BlobPart[]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        // Decision: Pull preserves the device's basename verbatim.
        // Anything fancier (prompt for path / preserve full path) gets
        // in the way; the user's downloads folder is the right home.
        a.download = entryName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setTransfer((cur) =>
          cur && cur.kind === 'pull' && cur.name === entryName
            ? { ...cur, done: true, bytes: cur.total ?? cur.bytes }
            : cur,
        );
        setTimeout(() => {
          setTransfer((cur) =>
            cur && cur.kind === 'pull' && cur.name === entryName && cur.done
              ? null
              : cur,
          );
        }, 1100);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Pull failed';
        showToast(msg);
        setTransfer(null);
      }
    },
    [entries, path, showToast],
  );

  // ---- Drag & drop -------------------------------------------------------
  const onDragOver = (e: ReactDragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      setDropping(true);
    }
  };
  const onDragLeave = (e: ReactDragEvent) => {
    if (e.currentTarget === e.target) setDropping(false);
  };
  const onDrop = (e: ReactDragEvent) => {
    e.preventDefault();
    setDropping(false);
    const files = Array.from(e.dataTransfer.files);
    // Decision: serial uploads. Concurrent pushes against one ADB
    // sync socket race for the writer lock; the simpler "queue them
    // up" loop is safer than parallelizing.
    void (async () => {
      for (const f of files) {
        await pushFile(f);
      }
    })();
  };

  // Drag-out for Pull: the browser doesn't expose a cleanish API for
  // drag-out-to-filesystem (DataTransferItem.add only takes strings or
  // Files; we don't have a File until we've already pulled). Instead
  // we treat a drag-out gesture on a row as a Pull trigger — i.e.
  // dragging a row anywhere outside the list initiates the download.
  // The HANDOFF spec just says "Drag a file out to download (Pull)";
  // this gesture matches that without requiring DataTransferItem
  // tricks that don't work cross-browser.
  const onRowDragStart = (e: ReactDragEvent, name: string) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', joinPath(path, name));
    // Defer the actual pull until dragend so the user has feedback if
    // they cancel the drag.
  };
  const onRowDragEnd = (e: ReactDragEvent, name: string) => {
    if (e.dataTransfer.dropEffect === 'none') return;
    void pullFile(name);
  };

  // ---- mkdir -------------------------------------------------------------
  const onNewFolder = useCallback(() => {
    setNewFolderOpen(true);
  }, []);

  const submitNewFolder = useCallback(async (name: string) => {
    setNewFolderOpen(false);
    const fs = fsRef.current;
    if (!fs || !name) return;
    try {
      await fs.mkdir(joinPath(path, name));
      await reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'mkdir failed';
      showToast(msg);
    }
  }, [path, reload, showToast]);

  // ---- delete ------------------------------------------------------------
  const removeEntries = useCallback(
    (names: string[]) => {
      if (names.length === 0) return;
      setConfirmDelete(names);
    },
    [],
  );

  const performDelete = useCallback(
    async (names: string[]) => {
      setConfirmDelete(null);
      const fs = fsRef.current;
      if (fs == null || names.length === 0) return;
      let failures = 0;
      for (const n of names) {
        try {
          await fs.remove(joinPath(path, n));
        } catch {
          failures += 1;
        }
      }
      // Drop the just-deleted names from the live selection so the
      // post-reload UI doesn't try to re-show pinned-foot path text
      // for a stale entry.
      setSelected((prev) => {
        const next = new Set(prev);
        for (const n of names) next.delete(n);
        return next;
      });
      await reload();
      if (failures === 0) {
        showToast(
          names.length === 1
            ? `Deleted ${names[0]}`
            : `Deleted ${names.length} items`,
        );
      } else if (failures < names.length) {
        showToast(`Deleted ${names.length - failures}/${names.length} items`);
      } else {
        showToast('Delete failed');
      }
    },
    [path, reload, showToast],
  );
  const onDeleteSelected = useCallback(() => {
    if (selected.size === 0) return;
    void removeEntries([...selected]);
  }, [removeEntries, selected]);

  // ---- Disposal ----------------------------------------------------------
  useEffect(() => {
    return () => {
      const fs = fsRef.current;
      if (fs) void fs.dispose();
      fsRef.current = null;
    };
  }, []);

  const crumbs = useMemo(() => {
    if (path === '/') return [{ label: '/', target: '/' }];
    const parts = path.split('/').filter(Boolean);
    const out = [{ label: '/', target: '/' }];
    let acc = '';
    for (const p of parts) {
      acc = acc + '/' + p;
      out.push({ label: p, target: acc });
    }
    return out;
  }, [path]);

  const onPullClick = () => {
    if (selected.size !== 1) return;
    const [first] = selected;
    void pullFile(first);
  };
  const onPushClick = () => fileInputRef.current?.click();

  // ---- Keyboard navigation ----------------------------------------------
  // List pane: ↑/↓ moves the cursor through `sorted`; Enter opens the
  // focused entry (folders navigate, files open on device); Backspace /
  // ← goes up one directory.
  const focusListRow = useCallback((name: string) => {
    setSelected(new Set([name]));
    lastClickedRef.current = name;
    const el = listScrollRef.current?.querySelector<HTMLElement>(
      `[data-fx-row="${cssEscape(name)}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, []);

  const onListKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (sorted.length === 0) return;
      const cur = lastClickedRef.current;
      const idx = cur ? sorted.findIndex((s) => s.name === cur) : -1;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = sorted[Math.min(sorted.length - 1, idx < 0 ? 0 : idx + 1)];
        if (next) focusListRow(next.name);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = sorted[Math.max(0, idx <= 0 ? 0 : idx - 1)];
        if (prev) focusListRow(prev.name);
      } else if (e.key === 'Enter' && idx >= 0) {
        e.preventDefault();
        onRowDouble(sorted[idx]);
      } else if ((e.key === 'Backspace' || e.key === 'ArrowLeft') && path !== '/') {
        e.preventDefault();
        goUp();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sorted, path, goUp, focusListRow],
  );

  // Tree pane: ↑/↓ walks the visible nodes in display order; → expands
  // (or steps into when already expanded); ← collapses (or steps to
  // parent when leaf); Enter selects the node into the list pane.
  const visibleTreeNodes = useMemo(() => {
    const out: { path: string; depth: number }[] = [];
    const walk = (p: string, depth: number) => {
      out.push({ path: p, depth });
      if (!treeExpanded.has(p)) return;
      const kids = treeChildren.get(p);
      if (!kids) return;
      for (const k of kids) {
        const child = p === '/' ? '/' + k.name : p + '/' + k.name;
        walk(child, depth + 1);
      }
    };
    walk(ROOT, 0);
    return out;
  }, [treeExpanded, treeChildren]);

  const focusTreeNode = useCallback((p: string) => {
    navigate(p);
    const el = treeScrollRef.current?.querySelector<HTMLElement>(
      `[data-fx-tnode="${cssEscape(p)}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [navigate]);

  const onTreeKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (visibleTreeNodes.length === 0) return;
      const idx = visibleTreeNodes.findIndex((n) => n.path === path);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = visibleTreeNodes[Math.min(visibleTreeNodes.length - 1, idx < 0 ? 0 : idx + 1)];
        if (next) focusTreeNode(next.path);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = visibleTreeNodes[Math.max(0, idx <= 0 ? 0 : idx - 1)];
        if (prev) focusTreeNode(prev.path);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (!treeExpanded.has(path)) {
          setTreeExpanded((prev) => {
            const n = new Set(prev);
            n.add(path);
            return n;
          });
          void loadTreeChildren(path);
        } else {
          const next = visibleTreeNodes[idx + 1];
          if (next && next.depth > (visibleTreeNodes[idx]?.depth ?? -1)) {
            focusTreeNode(next.path);
          }
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (treeExpanded.has(path) && path !== ROOT) {
          setTreeExpanded((prev) => {
            const n = new Set(prev);
            n.delete(path);
            return n;
          });
        } else if (path !== ROOT) {
          const parent = path.replace(/\/[^/]+$/, '') || '/';
          focusTreeNode(parent);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        focusTreeNode(path);
      }
    },
    [path, visibleTreeNodes, treeExpanded, loadTreeChildren, focusTreeNode],
  );

  // ---- Render ------------------------------------------------------------
  const widgetStyle: CSSProperties = {
    ['--widget-font-size' as string]: `${settings.fontSize}px`,
  } as CSSProperties;

  return (
    <div
      className={`fx-widget ${dropping ? 'fx-dropping' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={widgetStyle}
    >
      <div className="fx-toolbar widget-bar">
        <div className="fx-nav">
          <button
            className="icon-btn tt"
            data-tt="Back"
            onClick={goBack}
            disabled={back.length === 0}
            aria-label="Back"
          >
            <ArrowLeftIcon />
          </button>
          <button
            className="icon-btn tt"
            data-tt="Forward"
            onClick={goForward}
            disabled={forward.length === 0}
            aria-label="Forward"
          >
            <ArrowRightIcon />
          </button>
          <button
            className="icon-btn tt"
            data-tt="Up"
            onClick={goUp}
            disabled={path === '/'}
            aria-label="Up"
          >
            <ArrowUpIcon />
          </button>
          <button
            className="icon-btn tt"
            data-tt="Refresh"
            onClick={() => void reload()}
            aria-label="Refresh"
          >
            <Icons.Refresh size={14} />
          </button>
          <button
            className="icon-btn tt"
            data-tt="New folder"
            onClick={() => void onNewFolder()}
            aria-label="New folder"
          >
            <Icons.Plus size={14} />
          </button>
        </div>

        <div className="fx-crumbs" role="navigation" aria-label="Path">
          {crumbs.map((c, i) => (
            <span key={c.target} className="fx-crumb-wrap">
              {i > 0 && <span className="fx-sep">/</span>}
              <button
                className={`fx-crumb ${i === crumbs.length - 1 ? 'current' : ''}`}
                onClick={() => navigate(c.target)}
              >
                {c.label === '/' ? <PhoneIcon /> : c.label}
              </button>
            </span>
          ))}
        </div>

        <div className="fx-actions">
          <div className="fx-view-seg" role="group" aria-label="View mode">
            <button
              type="button"
              className={`fx-view-btn ${settings.viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setSettings({ viewMode: 'list' })}
              title="List view"
              aria-label="List view"
              aria-pressed={settings.viewMode === 'list'}
            >
              <ListViewIcon size={14} />
            </button>
            <button
              type="button"
              className={`fx-view-btn ${settings.viewMode === 'icons' ? 'active' : ''}`}
              onClick={() => setSettings({ viewMode: 'icons' })}
              title="Icons view"
              aria-label="Icons view"
              aria-pressed={settings.viewMode === 'icons'}
            >
              <IconsViewIcon size={14} />
            </button>
          </div>

          <span className="fx-actions-sep" aria-hidden />

          <button
            className={`icon-btn tt ${showHidden ? 'active' : ''}`}
            data-tt={showHidden ? 'Hide hidden' : 'Show hidden'}
            onClick={() => setShowHidden((s) => !s)}
            aria-label="Toggle hidden"
          >
            {showHidden ? <Icons.Eye size={14} /> : <Icons.EyeOff size={14} />}
          </button>
          <button
            className={`icon-btn tt ${settings.treeVisible ? 'active' : ''}`}
            data-tt={settings.treeVisible ? 'Hide tree pane' : 'Show tree pane'}
            onClick={() => setSettings({ treeVisible: !settings.treeVisible })}
            aria-label="Toggle tree pane"
          >
            <SidebarIcon size={14} />
          </button>

          <span className="fx-actions-sep" aria-hidden />

          <button
            className="icon-btn tt"
            data-tt="Push (upload)"
            onClick={onPushClick}
            aria-label="Push"
          >
            <UploadIcon />
          </button>
          <button
            className="icon-btn tt"
            data-tt="Pull (download)"
            onClick={onPullClick}
            disabled={selected.size !== 1}
            aria-label="Pull"
          >
            <DownloadIcon />
          </button>
          <button
            className="icon-btn tt"
            data-tt={
              selected.size === 0
                ? 'Delete (select first)'
                : selected.size === 1
                  ? 'Delete'
                  : `Delete ${selected.size} items`
            }
            onClick={onDeleteSelected}
            disabled={selected.size === 0}
            aria-label="Delete selected"
          >
            <Icons.Clear size={14} />
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={onChooseFile}
          aria-hidden
        />
      </div>

      {installing && (
        <div className="fx-xfer fx-xfer-busy" role="status" aria-live="polite">
          <span className="fx-xfer-icon">
            <Icons.Refresh size={12} />
          </span>
          <span className="fx-xfer-name">Installing · {installing}</span>
          <div className="fx-xfer-bar">
            <div className="fx-xfer-indeterminate" />
          </div>
          <span className="fx-xfer-pct">…</span>
        </div>
      )}
      {transfer && (
        <div className={`fx-xfer ${transfer.done ? 'done' : ''}`}>
          <span className="fx-xfer-icon">
            {transfer.done ? (
              <Icons.Check size={12} />
            ) : transfer.kind === 'push' ? (
              <UploadIcon size={12} />
            ) : (
              <DownloadIcon size={12} />
            )}
          </span>
          <span className="fx-xfer-name">
            {transfer.kind === 'push' ? 'Push' : 'Pull'} · {transfer.name}
          </span>
          <div className="fx-xfer-bar">
            <div
              style={{
                width:
                  transfer.total != null && transfer.total > 0
                    ? Math.min(100, (transfer.bytes / transfer.total) * 100) + '%'
                    : transfer.done
                      ? '100%'
                      : '40%',
              }}
            />
          </div>
          <span className="fx-xfer-pct">
            {transfer.total != null && transfer.total > 0
              ? Math.round((transfer.bytes / transfer.total) * 100) + '%'
              : transfer.done
                ? '100%'
                : '...'}
          </span>
        </div>
      )}

      <div className="fx-body">
        {settings.treeVisible && (
          <div
            className="fx-tree"
            role="tree"
            tabIndex={0}
            ref={treeScrollRef}
            onKeyDown={onTreeKeyDown}
            onClick={() => {
              if (!treeScrollRef.current?.contains(document.activeElement)) {
                treeScrollRef.current?.focus({ preventScroll: true });
              }
            }}
          >
            <FxTree
              path={ROOT}
              label="/"
              depth={0}
              currentPath={path}
              expanded={treeExpanded}
              children_={treeChildren}
              onToggle={(p) => {
                setTreeExpanded((prev) => {
                  const next = new Set(prev);
                  if (next.has(p)) next.delete(p);
                  else {
                    next.add(p);
                    void loadTreeChildren(p);
                  }
                  return next;
                });
              }}
              onSelect={(p) => navigate(p)}
            />
          </div>
        )}
        <div
          className="fx-list-pane"
          tabIndex={0}
          ref={listScrollRef}
          onKeyDown={onListKeyDown}
          onClick={(e) => {
            // Promote focus to the pane on any click within so arrow-
            // key navigation works after a row click.
            if (!listScrollRef.current?.contains(document.activeElement)) {
              listScrollRef.current?.focus({ preventScroll: true });
            } else if (document.activeElement !== listScrollRef.current) {
              // Click landed on a non-focusable child (e.g. a row) —
              // hand focus back to the pane so onKeyDown fires.
              const t = e.target as HTMLElement;
              if (t.tagName !== 'BUTTON' && t.tagName !== 'INPUT') {
                listScrollRef.current?.focus({ preventScroll: true });
              }
            }
          }}
        >
          {settings.viewMode === 'list' && (
            <div className="fx-listhead" role="row">
              <button
                className={`fx-h ${sortBy === 'name' ? 'on ' + sortDir : ''}`}
                onClick={() => toggleSort('name')}
                style={{ flex: 2 }}
              >
                Name
              </button>
              <button
                className={`fx-h ${sortBy === 'size' ? 'on ' + sortDir : ''}`}
                onClick={() => toggleSort('size')}
                style={{ width: 80 }}
              >
                Size
              </button>
              <button
                className={`fx-h ${sortBy === 'perms' ? 'on ' + sortDir : ''}`}
                onClick={() => toggleSort('perms')}
                style={{ width: 110 }}
              >
                Permissions
              </button>
              <button
                className={`fx-h ${sortBy === 'mtime' ? 'on ' + sortDir : ''}`}
                onClick={() => toggleSort('mtime')}
                style={{ width: 140 }}
              >
                Modified
              </button>
            </div>
          )}

          <div className={`fx-list ${settings.viewMode === 'icons' ? 'fx-icons' : ''}`}>
            {loading ? (
              <div className="fx-empty">
                <span>Loading…</span>
              </div>
            ) : error ? (
              <div className="fx-empty">
                <span className="fx-error">{error}</span>
              </div>
            ) : sorted.length === 0 ? (
              <div className="fx-empty">
                <Icons.Folder size={28} />
                <span>Empty directory</span>
              </div>
            ) : settings.viewMode === 'icons' ? (
              sorted.map((entry) => (
                <div
                  key={entry.name}
                  data-fx-row={entry.name}
                  className={`fx-tile ${selected.has(entry.name) ? 'sel ' : ''}${entry.type}`}
                  onClick={(e) => onRowClick(e, entry.name)}
                  onDoubleClick={() => onRowDouble(entry)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (!selected.has(entry.name)) {
                      setSelected(new Set([entry.name]));
                      lastClickedRef.current = entry.name;
                    }
                    setContextMenu({ x: e.clientX, y: e.clientY, entry });
                  }}
                  draggable={entry.type === 'file'}
                  onDragStart={(e) => onRowDragStart(e, entry.name)}
                  onDragEnd={(e) => onRowDragEnd(e, entry.name)}
                  title={
                    entry.type === 'link' && entry.linkTarget
                      ? `${entry.name} → ${entry.linkTarget}`
                      : entry.name
                  }
                >
                  <div className="fx-tile-icon">
                    <FileIcon entry={entry} large />
                  </div>
                  <div className="fx-tile-name">{entry.name}</div>
                </div>
              ))
            ) : (
              sorted.map((entry) => (
                <div
                  key={entry.name}
                  data-fx-row={entry.name}
                  className={`fx-row ${selected.has(entry.name) ? 'sel ' : ''}${entry.type}`}
                  onClick={(e) => onRowClick(e, entry.name)}
                  onDoubleClick={() => onRowDouble(entry)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    // Promote the right-clicked entry into the
                    // selection so subsequent menu actions match
                    // what the user expects to be "current".
                    if (!selected.has(entry.name)) {
                      setSelected(new Set([entry.name]));
                      lastClickedRef.current = entry.name;
                    }
                    setContextMenu({ x: e.clientX, y: e.clientY, entry });
                  }}
                  draggable={entry.type === 'file'}
                  onDragStart={(e) => onRowDragStart(e, entry.name)}
                  onDragEnd={(e) => onRowDragEnd(e, entry.name)}
                >
                  <div className="fx-cell name" style={{ flex: 2 }}>
                    <FileIcon entry={entry} />
                    <span className="fx-name">{entry.name}</span>
                    {entry.type === 'link' && entry.linkTarget && (
                      <span className="fx-link"> → {entry.linkTarget}</span>
                    )}
                  </div>
                  <div className="fx-cell num" style={{ width: 80 }}>
                    {entry.type === 'file' ? formatBytes(entry.size) : '—'}
                  </div>
                  <div className="fx-cell mono" style={{ width: 110 }}>
                    {formatPerms(entry)}
                  </div>
                  <div className="fx-cell mono" style={{ width: 140 }}>
                    {formatMtime(entry.mtime)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="fx-footer">
        <span>
          {sorted.length} item{sorted.length === 1 ? '' : 's'}
        </span>
        <span style={{ flex: 1 }} />
        {selected.size === 1 && (
          <span className="mono fx-foot-path">{joinPath(path, [...selected][0])}</span>
        )}
        {selected.size > 1 && <span>{selected.size} selected</span>}
      </div>

      {contextMenu && (
        <FxContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          entry={contextMenu.entry}
          path={path}
          onClose={() => setContextMenu(null)}
          onOpen={() => {
            setContextMenu(null);
            void openOnDevice(contextMenu.entry);
          }}
          onPull={() => {
            setContextMenu(null);
            void pullFile(contextMenu.entry.name);
          }}
          onCopyPath={() => {
            setContextMenu(null);
            const full = joinPath(path, contextMenu.entry.name);
            void navigator.clipboard
              .writeText(full)
              .then(() => showToast('Path copied'))
              .catch(() => showToast('Copy failed'));
          }}
          onNavigate={() => {
            const e = contextMenu.entry;
            setContextMenu(null);
            if (e.type === 'dir') navigate(joinPath(path, e.name));
            else if (e.type === 'link' && e.linkTarget) navigate(e.linkTarget);
          }}
          onDelete={() => {
            const e = contextMenu.entry;
            setContextMenu(null);
            void removeEntries([e.name]);
          }}
        />
      )}

      <PromptDialog
        open={newFolderOpen}
        title="New folder"
        label="Folder name"
        placeholder="my-folder"
        okLabel="Create"
        validate={(v) => {
          if (!v.trim()) return 'Name cannot be empty';
          if (v.includes('/')) return 'Folder name cannot contain "/"';
          return null;
        }}
        onSubmit={(v) => void submitNewFolder(v.trim())}
        onCancel={() => setNewFolderOpen(false)}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        title={
          confirmDelete && confirmDelete.length === 1
            ? 'Delete file'
            : 'Delete files'
        }
        message={
          confirmDelete && confirmDelete.length === 1
            ? `Delete "${confirmDelete[0]}"? This cannot be undone.`
            : `Delete ${confirmDelete?.length ?? 0} items? This cannot be undone.`
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => confirmDelete && void performDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

// ---- Right-click context menu ---------------------------------------------

interface FxContextMenuProps {
  onDelete: () => void;
  x: number;
  y: number;
  entry: SyncEntry;
  path: string;
  onClose: () => void;
  onOpen: () => void;
  onPull: () => void;
  onCopyPath: () => void;
  onNavigate: () => void;
}

function FxContextMenu({
  x,
  y,
  entry,
  path,
  onClose,
  onOpen,
  onPull,
  onCopyPath,
  onNavigate,
  onDelete,
}: FxContextMenuProps) {
  void path;
  // Click-outside + Esc dismiss. Models on the device-picker popover.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('.fx-ctx')) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const isDir = entry.type === 'dir';
  const isLinkToDir =
    entry.type === 'link' && entry.linkTarget?.endsWith('/');
  // Render via a portal to document.body so the `position: fixed` menu
  // doesn't get re-rooted by a transformed ancestor (the dashboard
  // tile chrome uses `transform` for drag-to-swap; under certain DPR
  // / display configurations the menu was offsetting up to 25 % of
  // the viewport on retina M-series Macs).
  return createPortal(
    <div
      className="fx-ctx"
      style={{ left: x, top: y }}
      role="menu"
      aria-label="File actions"
    >
      {(isDir || isLinkToDir) && (
        <button type="button" role="menuitem" onClick={onNavigate}>
          <Icons.Folder size={12} /> Open folder
        </button>
      )}
      {!isDir && (
        <button type="button" role="menuitem" onClick={onOpen}>
          <Icons.Eye size={12} /> Open on device
        </button>
      )}
      {!isDir && (
        <button type="button" role="menuitem" onClick={onPull}>
          <Icons.Down size={12} /> Pull to local
        </button>
      )}
      <button type="button" role="menuitem" onClick={onCopyPath}>
        <Icons.Stack size={12} /> Copy full path
      </button>
      <div className="fx-ctx-sep" role="separator" />
      <button
        type="button"
        role="menuitem"
        className="fx-ctx-danger"
        onClick={onDelete}
      >
        <Icons.Clear size={12} /> Delete
      </button>
    </div>,
    document.body,
  );
}

// ---- Tree pane sub-component ----------------------------------------------

interface FxTreeProps {
  path: string;
  label: string;
  depth: number;
  currentPath: string;
  expanded: Set<string>;
  // `children` is reserved by React; rename to avoid shadowing.
  children_: Map<string, SyncEntry[]>;
  onToggle: (p: string) => void;
  onSelect: (p: string) => void;
}

function FxTree(props: FxTreeProps) {
  const { path, label, depth, currentPath, expanded, children_, onToggle, onSelect } = props;
  const isOpen = expanded.has(path);
  const kids = children_.get(path);
  const isCurrent = path === currentPath;
  return (
    <>
      <div
        className={`fx-tnode ${isCurrent ? 'sel' : ''}`}
        data-fx-tnode={path}
        style={{ paddingLeft: 6 + depth * 12 }}
        onClick={() => onSelect(path)}
      >
        <button
          className="fx-tcaret"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(path);
          }}
          aria-label={isOpen ? 'Collapse' : 'Expand'}
        >
          <Icons.ChevronRight size={10} style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }} />
        </button>
        <FolderIcon open={isOpen} />
        <span className="fx-tname">{label}</span>
      </div>
      {isOpen &&
        kids &&
        kids.map((kid) => (
          <FxTree
            key={path === '/' ? '/' + kid.name : path + '/' + kid.name}
            path={path === '/' ? '/' + kid.name : path + '/' + kid.name}
            label={kid.name}
            depth={depth + 1}
            currentPath={currentPath}
            expanded={expanded}
            children_={children_}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}

// ---- Inline icons (Files-specific; not reusable elsewhere) ----------------
//
// Icons.tsx is the shared registry; the design references several glyphs
// that aren't in it (Phone, ArrowUp/Left/Right, Upload/Download). Per
// PR scope they live here as small components instead of widening the
// shared registry.

interface InlineIconProps {
  size?: number;
}

function ArrowLeftIcon({ size = 14 }: InlineIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}
function ArrowRightIcon({ size = 14 }: InlineIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}
function ArrowUpIcon({ size = 14 }: InlineIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}
function UploadIcon({ size = 14 }: InlineIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v15M5 11l7-7 7 7" />
      <path d="M3 21h18" />
    </svg>
  );
}
function DownloadIcon({ size = 14 }: InlineIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v15M5 13l7 7 7-7" />
      <path d="M3 21h18" />
    </svg>
  );
}
function PhoneIcon({ size = 11 }: InlineIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm3 18h4" />
    </svg>
  );
}
function FolderIcon({ open, size = 14 }: { open: boolean; size?: number }) {
  // Filled folder tinted with the dashboard accent (theme primary).
  const color = 'var(--accent)';
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ flexShrink: 0, color }}>
      <path
        d={
          open
            ? 'M 1.5 5 L 1.5 13 Q 1.5 14 2.5 14 L 13 14 L 14.5 7 L 5.5 7 L 4 5 Z'
            : 'M 1.5 4 L 1.5 13 Q 1.5 14 2.5 14 L 13.5 14 Q 14.5 14 14.5 13 L 14.5 6 Q 14.5 5 13.5 5 L 7 5 L 5.5 3 L 2.5 3 Q 1.5 3 1.5 4 Z'
        }
        fill="currentColor"
        fillOpacity="0.85"
        stroke="currentColor"
        strokeWidth="0.5"
        strokeOpacity="0.6"
      />
    </svg>
  );
}

function FileIcon({ entry, large = false }: { entry: SyncEntry; large?: boolean }) {
  // 14px in list view, 40px in icons view — the SVG paths are
  // viewBox-based so a single `size` prop scales them cleanly.
  const size = large ? 40 : 14;
  if (entry.type === 'dir') return <FolderIcon open={false} size={size} />;
  // Outline-only files vs. filled folders — gives the column a clear
  // "container vs. leaf" rhythm at 14px without leaning on color alone
  // (folders are already accent-tinted).
  const color = 'var(--accent)';
  if (entry.type === 'link') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" style={{ flexShrink: 0, color }}>
        <path d="M 6 9 L 4 11 Q 2 13 4 15 Q 6 17 8 15 L 10 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M 10 7 L 12 5 Q 14 3 12 1 Q 10 -1 8 1 L 6 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ flexShrink: 0, color }}>
      <path
        d="M 3 1.5 L 3 14.5 Q 3 15 3.5 15 L 12.5 15 Q 13 15 13 14.5 L 13 5 L 9 1.5 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M 9 1.5 L 9 5 L 13 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SidebarIcon({ size = 14 }: InlineIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M 6 3 L 6 13" />
    </svg>
  );
}

function ListViewIcon({ size = 14 }: InlineIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <path d="M 3 4 L 13 4" />
      <path d="M 3 8 L 13 8" />
      <path d="M 3 12 L 13 12" />
    </svg>
  );
}

function IconsViewIcon({ size = 14 }: InlineIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4}>
      <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="0.5" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx="0.5" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx="0.5" />
      <rect x="9" y="9" width="4.5" height="4.5" rx="0.5" />
    </svg>
  );
}

// ---- Helpers --------------------------------------------------------------

function joinPath(a: string, b: string): string {
  if (a === '/') return '/' + b;
  return a + '/' + b;
}

/** Quote a string for use as a CSS attribute selector value. We only
 *  use it to look up rows by their `data-fx-row` attribute, so the
 *  shape of the input is whatever the device's filesystem hands us. */
function cssEscape(s: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(s);
  }
  return s.replace(/["\\]/g, '\\$&');
}

function formatBytes(n: number): string {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
  return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

function formatMtime(secs: number): string {
  if (!secs) return '';
  const d = new Date(secs * 1000);
  if (Number.isNaN(d.getTime())) return '';
  // YYYY-MM-DD HH:MM — matches the design reference.
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatPerms(entry: SyncEntry): string {
  // Render the permission bits in the conventional rwxr-xr-x form,
  // prefixed with the type letter so the column reads like `ls -l`.
  const t = entry.type === 'dir' ? 'd' : entry.type === 'link' ? 'l' : '-';
  const bits = entry.permission;
  const triplet = (n: number) =>
    ((n & 4) ? 'r' : '-') + ((n & 2) ? 'w' : '-') + ((n & 1) ? 'x' : '-');
  return t + triplet((bits >> 6) & 7) + triplet((bits >> 3) & 7) + triplet(bits & 7);
}
