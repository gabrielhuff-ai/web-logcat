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
import * as Icons from '../Icons';
import { useAdb } from '../../lib/adbContext';
import { useDashboardChrome } from '../../lib/dashboardChrome';
import {
  createSync,
  PROGRESS_THRESHOLD,
  type SyncEntry,
  type SyncFs,
  type WriteProgress,
} from '../../lib/sync';

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
  const { device, adb, usingFake } = useAdb();
  const { showToast } = useDashboardChrome();

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

  const cwdKey = useMemo(
    () => (device ? `weblogcat:files:${device.serial}:${tileId}:cwd` : null),
    [device, tileId],
  );

  const [path, setPath] = useState<string>(() => {
    if (cwdKey) {
      try {
        const raw = localStorage.getItem(cwdKey);
        if (raw && raw.startsWith('/')) return raw;
      } catch {
        /* ignore */
      }
    }
    return '/sdcard/Download';
  });
  // Back/forward stacks. The current path is the top of `back`; when
  // the user clicks back we pop into `forward` and vice versa.
  const [back, setBack] = useState<string[]>([]);
  const [forward, setForward] = useState<string[]>([]);

  const [entries, setEntries] = useState<SyncEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const lastClickedRef = useRef<string | null>(null);

  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [showHidden, setShowHidden] = useState(false);

  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [dropping, setDropping] = useState(false);

  // Tree pane owns its own expanded set so opening a directory in the
  // list pane doesn't auto-expand the tree (matches Finder / VS Code).
  const [treeExpanded, setTreeExpanded] = useState<Set<string>>(
    () => new Set(['/']),
  );
  const [treeChildren, setTreeChildren] = useState<Map<string, SyncEntry[]>>(
    () => new Map(),
  );

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Persist cwd.
  useEffect(() => {
    if (!cwdKey) return;
    try {
      localStorage.setItem(cwdKey, path);
    } catch {
      /* ignore */
    }
  }, [cwdKey, path]);

  // ---- Tree pane lazy-load ------------------------------------------------
  const loadTreeChildren = useCallback(async (dirPath: string) => {
    const fs = fsRef.current;
    if (!fs) return;
    if (treeChildrenRef.current.has(dirPath)) return;
    try {
      const list = await fs.list(dirPath);
      setTreeChildren((prev) => {
        const next = new Map(prev);
        next.set(dirPath, list.filter((e) => e.type === 'dir'));
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
  // are. Walks `/`, `/sdcard`, `/sdcard/Download`, ...
  useEffect(() => {
    if (path === '/') return;
    const parts = path.split('/').filter(Boolean);
    let acc = '';
    const ancestors: string[] = ['/'];
    for (const p of parts) {
      acc = (acc === '' ? '' : acc) + '/' + p;
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
  const onRowDouble = (entry: SyncEntry) => {
    if (entry.type === 'dir') {
      navigate(joinPath(path, entry.name));
    } else if (entry.type === 'link' && entry.linkTarget) {
      navigate(entry.linkTarget);
    }
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
  const onNewFolder = useCallback(async () => {
    const fs = fsRef.current;
    if (!fs) return;
    const name = window.prompt('New folder name');
    if (!name) return;
    if (name.includes('/')) {
      showToast('Folder name cannot contain "/"');
      return;
    }
    try {
      await fs.mkdir(joinPath(path, name));
      await reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'mkdir failed';
      showToast(msg);
    }
  }, [path, reload, showToast]);

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

  // ---- Render ------------------------------------------------------------
  return (
    <div
      className={`fx-widget ${dropping ? 'fx-dropping' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
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
            className={`icon-btn tt ${showHidden ? 'active' : ''}`}
            data-tt={showHidden ? 'Hide hidden' : 'Show hidden'}
            onClick={() => setShowHidden((s) => !s)}
            aria-label="Toggle hidden"
          >
            {showHidden ? <Icons.Eye size={14} /> : <Icons.EyeOff size={14} />}
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
        <div className="fx-tree" role="tree">
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
        <div className="fx-list-pane">
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

          <div className="fx-list">
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
            ) : (
              sorted.map((entry) => (
                <div
                  key={entry.name}
                  className={`fx-row ${selected.has(entry.name) ? 'sel ' : ''}${entry.type}`}
                  onClick={(e) => onRowClick(e, entry.name)}
                  onDoubleClick={() => onRowDouble(entry)}
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
    </div>
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
function FolderIcon({ open }: { open: boolean }) {
  // Filled folder mirroring the design's accent-tinted glyph.
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      <path
        d={
          open
            ? 'M 1.5 5 L 1.5 13 Q 1.5 14 2.5 14 L 13 14 L 14.5 7 L 5.5 7 L 4 5 Z'
            : 'M 1.5 4 L 1.5 13 Q 1.5 14 2.5 14 L 13.5 14 Q 14.5 14 14.5 13 L 14.5 6 Q 14.5 5 13.5 5 L 7 5 L 5.5 3 L 2.5 3 Q 1.5 3 1.5 4 Z'
        }
        fill="oklch(0.78 0.1 80)"
        fillOpacity="0.85"
        stroke="oklch(0.4 0.05 80)"
        strokeWidth="0.5"
        strokeOpacity="0.4"
      />
    </svg>
  );
}

function FileIcon({ entry }: { entry: SyncEntry }) {
  if (entry.type === 'dir') return <FolderIcon open={false} />;
  if (entry.type === 'link') {
    return (
      <svg width={14} height={14} viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
        <path d="M 6 9 L 4 11 Q 2 13 4 15 Q 6 17 8 15 L 10 13" fill="none" stroke="oklch(0.78 0.13 220)" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M 10 7 L 12 5 Q 14 3 12 1 Q 10 -1 8 1 L 6 3" fill="none" stroke="oklch(0.78 0.13 220)" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
  const colorMap: Record<string, string> = {
    apk: 'oklch(0.7 0.13 150)',
    jpg: 'oklch(0.78 0.13 30)',
    jpeg: 'oklch(0.78 0.13 30)',
    png: 'oklch(0.78 0.13 30)',
    pdf: 'oklch(0.7 0.16 25)',
    json: 'oklch(0.78 0.13 80)',
    md: 'oklch(0.78 0.13 220)',
    txt: 'oklch(0.78 0.13 220)',
    zip: 'oklch(0.78 0.13 80)',
    perfetto: 'oklch(0.78 0.16 320)',
    mp3: 'oklch(0.78 0.16 320)',
    bin: 'oklch(0.7 0.05 280)',
    dat: 'oklch(0.7 0.05 280)',
    tmp: 'oklch(0.7 0.05 280)',
  };
  const color = colorMap[ext] ?? 'oklch(0.65 0.02 280)';
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      <path
        d="M 3 1.5 L 3 14.5 Q 3 15 3.5 15 L 12.5 15 Q 13 15 13 14.5 L 13 5 L 9 1.5 Z"
        fill={color}
        fillOpacity="0.5"
        stroke={color}
        strokeWidth="0.8"
      />
      <path d="M 9 1.5 L 9 5 L 13 5" fill="none" stroke={color} strokeWidth="0.8" />
    </svg>
  );
}

// ---- Helpers --------------------------------------------------------------

function joinPath(a: string, b: string): string {
  if (a === '/') return '/' + b;
  return a + '/' + b;
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
