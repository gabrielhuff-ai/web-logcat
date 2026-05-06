// File Explorer widget — browses an Android-like file system, supports up/download UI

// Build a fake but plausible Android FS tree
function buildAndroidFS() {
  const file = (name, size, mtime, opts = {}) => ({
    type: "file", name, size, mtime, perms: opts.perms || "-rw-rw----", owner: opts.owner || "u0_a142", group: opts.group || "sdcard_rw",
  });
  const dir = (name, children, opts = {}) => ({
    type: "dir", name, children, perms: opts.perms || "drwxrwx---", owner: opts.owner || "root", group: opts.group || "root", mtime: opts.mtime || "2024-12-10 09:14",
  });
  const link = (name, target) => ({ type: "link", name, target, perms: "lrwxrwxrwx", owner: "root", group: "root" });

  return dir("/", [
    dir("sdcard", [
      dir("DCIM", [
        dir("Camera", Array.from({ length: 12 }, (_, i) => {
          const date = new Date(Date.now() - i * 86400_000 * 0.7);
          const ts = date.toISOString().slice(0, 16).replace("T", "_").replace(/[:-]/g, "");
          return file(`IMG_${ts}.jpg`, 2_000_000 + Math.floor(Math.random() * 4_000_000), date.toISOString().slice(0, 16).replace("T", " "));
        })),
      ], { mtime: "2024-12-12 09:42" }),
      dir("Download", [
        file("invoice-202411.pdf", 184_320, "2024-11-30 16:22"),
        file("backup-config.json", 4_812, "2024-12-01 10:08"),
        file("instrumentation-trace.perfetto", 12_482_312, "2024-12-09 17:48"),
        file("crash-report-2024-12-08.zip", 982_124, "2024-12-08 22:12"),
        file("RELEASE_NOTES.md", 8_212, "2024-12-11 08:05"),
      ]),
      dir("Pictures", [
        dir("Screenshots", Array.from({ length: 8 }, (_, i) => {
          const date = new Date(Date.now() - i * 86400_000 * 0.4);
          return file(`Screenshot_${date.toISOString().slice(0, 10)}_${String(8 + i).padStart(2, "0")}-${String(12 + i).padStart(2, "0")}-15.png`, 280_000 + i * 12_000, date.toISOString().slice(0, 16).replace("T", " "));
        })),
        dir("Wallpapers", []),
      ]),
      dir("Music", [
        file(".nomedia", 0, "2024-08-12 14:00"),
        file("alarm.mp3", 48_124, "2024-09-02 11:30"),
      ]),
      dir("Movies", []),
      dir("Documents", [
        file("notes.txt", 1_204, "2024-12-11 10:14"),
        file("todo.md", 612, "2024-12-12 08:22"),
      ]),
      dir("Android", [
        dir("data", [
          dir("com.example.shopapp", [
            dir("cache", [
              file("img-cache.bin", 4_812_000, "2024-12-12 14:08"),
              file("response-cache.bin", 1_204_000, "2024-12-12 14:11"),
            ]),
            dir("files", [
              file("session.dat", 2_408, "2024-12-12 13:55"),
            ]),
          ]),
          dir("com.spotify.music", [
            dir("cache", [
              file("audio-0.tmp", 18_400_000, "2024-12-12 12:48"),
            ]),
          ]),
        ], { perms: "drwxrws---", group: "ext_data_rw" }),
        dir("media", []),
        dir("obb", []),
      ]),
    ], { perms: "drwxrwx--x", owner: "root", group: "sdcard_rw" }),
    dir("system", [
      dir("bin", [
        file("sh", 152_312, "2024-08-12 04:00", { perms: "-rwxr-xr-x", owner: "root" }),
        file("ls", 84_192, "2024-08-12 04:00", { perms: "-rwxr-xr-x", owner: "root" }),
        file("cat", 76_124, "2024-08-12 04:00", { perms: "-rwxr-xr-x", owner: "root" }),
        file("toolbox", 218_120, "2024-08-12 04:00", { perms: "-rwxr-xr-x", owner: "root" }),
      ]),
      dir("etc", [
        file("hosts", 312, "2024-08-12 04:00", { perms: "-rw-r--r--", owner: "root" }),
        file("system_fonts.xml", 18_482, "2024-08-12 04:00", { perms: "-rw-r--r--", owner: "root" }),
      ]),
      dir("framework", []),
      dir("app", []),
    ], { perms: "drwxr-xr-x", owner: "root" }),
    dir("data", [
      dir("app", [
        dir("com.example.shopapp-1", [
          file("base.apk", 18_482_124, "2024-12-08 12:00", { perms: "-rw-r--r--" }),
        ]),
      ], { perms: "drwxrwx--x" }),
      dir("local", [
        dir("tmp", [
          file("frida-server", 28_482_124, "2024-12-10 14:08", { perms: "-rwxrwxrwx" }),
        ], { perms: "drwxrwxrwx", owner: "shell", group: "shell" }),
      ]),
    ], { perms: "drwxrwx--x", owner: "system" }),
    link("sdcard0", "/storage/emulated/0"),
    dir("proc", [], { perms: "dr-xr-xr-x" }),
    dir("dev", [], { perms: "drwxr-xr-x" }),
    dir("vendor", [], { perms: "drwxr-xr-x" }),
  ]);
}

function pathParts(path) {
  return path === "/" ? [""] : path.split("/");
}
function joinPath(parts) {
  const p = parts.filter(Boolean).join("/");
  return p ? "/" + p : "/";
}
function nodeAt(root, path) {
  if (path === "/") return root;
  const parts = path.split("/").filter(Boolean);
  let cur = root;
  for (const p of parts) {
    if (cur.type !== "dir") return null;
    cur = cur.children.find(c => c.name === p);
    if (!cur) return null;
  }
  return cur;
}

function fmtBytes(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + " MB";
  return (n / 1024 / 1024 / 1024).toFixed(2) + " GB";
}

function FilesWidget({ device, initial }) {
  const root = React.useMemo(() => buildAndroidFS(), []);
  const [path, setPath] = React.useState(initial?.path || "/sdcard/Download");
  const [selected, setSelected] = React.useState(null);
  const [showHidden, setShowHidden] = React.useState(false);
  const [sortBy, setSortBy] = React.useState("name"); // name | size | mtime
  const [sortDir, setSortDir] = React.useState("asc");
  const [viewMode, setViewMode] = React.useState("list"); // list | grid
  const [filter, setFilter] = React.useState("");
  const [transfer, setTransfer] = React.useState(null); // { type: 'up'|'down', name, pct }

  const cur = nodeAt(root, path);
  const parts = path === "/" ? ["/"] : ["/", ...path.split("/").filter(Boolean)];

  const items = React.useMemo(() => {
    if (!cur || cur.type !== "dir") return [];
    let list = cur.children.slice();
    if (!showHidden) list = list.filter(c => !c.name.startsWith("."));
    if (filter) list = list.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()));
    list.sort((a, b) => {
      // Dirs first
      if (a.type !== b.type) {
        if (a.type === "dir") return -1;
        if (b.type === "dir") return 1;
      }
      let cmp = 0;
      if (sortBy === "name") cmp = a.name.localeCompare(b.name);
      else if (sortBy === "size") cmp = (a.size || 0) - (b.size || 0);
      else if (sortBy === "mtime") cmp = String(a.mtime || "").localeCompare(b.mtime || "");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [cur, showHidden, filter, sortBy, sortDir]);

  const open = (item) => {
    if (item.type === "dir") {
      setPath(path === "/" ? "/" + item.name : path + "/" + item.name);
      setSelected(null);
    } else if (item.type === "link") {
      setPath(item.target);
      setSelected(null);
    } else {
      setSelected(item.name);
    }
  };

  const goUp = () => {
    if (path === "/") return;
    const parts = path.split("/").filter(Boolean);
    parts.pop();
    setPath(parts.length ? "/" + parts.join("/") : "/");
    setSelected(null);
  };

  const startDownload = () => {
    if (!selected) return;
    const item = cur.children.find(c => c.name === selected);
    if (!item || item.type !== "file") return;
    runTransfer({ type: "down", name: item.name, total: item.size });
  };
  const startUpload = () => {
    runTransfer({ type: "up", name: "release-build-1.4.2.apk", total: 18_400_000 });
  };

  const runTransfer = ({ type, name, total }) => {
    setTransfer({ type, name, pct: 0 });
    let pct = 0;
    const id = setInterval(() => {
      pct += 6 + Math.random() * 8;
      if (pct >= 100) {
        clearInterval(id);
        setTransfer({ type, name, pct: 100, done: true });
        setTimeout(() => setTransfer(null), 1100);
      } else {
        setTransfer({ type, name, pct });
      }
    }, 90);
  };

  const toggleSort = (key) => {
    if (sortBy === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(key); setSortDir("asc"); }
  };

  return (
    <div className="fx-widget">
      <div className="fx-toolbar">
        <button className="icon-btn tt" data-tt="Up" onClick={goUp} disabled={path === "/"}>
          <Icons.ArrowUp size={13} />
        </button>
        <div className="fx-crumbs">
          {parts.map((p, i) => {
            const target = i === 0 ? "/" : joinPath(parts.slice(1, i + 1));
            return (
              <React.Fragment key={i}>
                {i > 0 && <span className="fx-sep">/</span>}
                <button className={"fx-crumb " + (i === parts.length - 1 ? "current" : "")} onClick={() => setPath(target)}>
                  {p === "/" ? <Icons.Phone size={11} /> : p}
                </button>
              </React.Fragment>
            );
          })}
        </div>
        <div className="fx-search">
          <Icons.Search size={11} />
          <input type="text" placeholder="Filter…" value={filter} onChange={e => setFilter(e.target.value)} />
        </div>
        <div className="fx-actions">
          <button className="icon-btn tt" data-tt="Upload to device" onClick={startUpload}>
            <Icons.Upload size={13} />
          </button>
          <button className="icon-btn tt" data-tt="Download" onClick={startDownload} disabled={!selected}>
            <Icons.Download size={13} />
          </button>
          <button className={"icon-btn tt " + (showHidden ? "on" : "")} data-tt="Show hidden" onClick={() => setShowHidden(s => !s)}>
            <Icons.EyeSlash size={13} />
          </button>
        </div>
      </div>

      {transfer && (
        <div className={"fx-xfer " + (transfer.done ? "done" : "")}>
          <span className="fx-xfer-icon">
            {transfer.done ? <Icons.Check size={12} /> : transfer.type === "up" ? <Icons.Upload size={12} /> : <Icons.Download size={12} />}
          </span>
          <span className="fx-xfer-name">{transfer.type === "up" ? "Push" : "Pull"} · {transfer.name}</span>
          <div className="fx-xfer-bar"><div style={{ width: transfer.pct + "%" }} /></div>
          <span className="fx-xfer-pct">{Math.round(transfer.pct)}%</span>
        </div>
      )}

      <div className="fx-listhead">
        <button className={"fx-h " + (sortBy === "name" ? "on " + sortDir : "")} onClick={() => toggleSort("name")} style={{ flex: 2 }}>Name</button>
        <button className={"fx-h " + (sortBy === "size" ? "on " + sortDir : "")} onClick={() => toggleSort("size")} style={{ width: 80 }}>Size</button>
        <button className="fx-h" style={{ width: 110 }}>Owner</button>
        <button className="fx-h" style={{ width: 110 }}>Permissions</button>
        <button className={"fx-h " + (sortBy === "mtime" ? "on " + sortDir : "")} onClick={() => toggleSort("mtime")} style={{ width: 130 }}>Modified</button>
      </div>

      <div className="fx-list">
        {items.length === 0 ? (
          <div className="fx-empty">
            <Icons.Folder size={32} opacity={0.3} />
            <span>{filter ? "Nothing matches the filter" : "Empty directory"}</span>
          </div>
        ) : items.map(item => (
          <div
            key={item.name}
            className={"fx-row " + (selected === item.name ? "sel " : "") + item.type}
            onClick={() => setSelected(item.name)}
            onDoubleClick={() => open(item)}
          >
            <div className="fx-cell name" style={{ flex: 2 }}>
              <FileIcon item={item} />
              <span className="fx-name">{item.name}</span>
              {item.type === "link" && <span className="fx-link"> → {item.target}</span>}
            </div>
            <div className="fx-cell" style={{ width: 80, color: "var(--fg-2)", fontVariantNumeric: "tabular-nums" }}>
              {item.type === "file" ? fmtBytes(item.size) : item.type === "dir" ? "—" : ""}
            </div>
            <div className="fx-cell mono" style={{ width: 110 }}>{item.owner || ""}</div>
            <div className="fx-cell mono" style={{ width: 110 }}>{item.perms || ""}</div>
            <div className="fx-cell mono" style={{ width: 130, color: "var(--fg-3)" }}>{item.mtime || ""}</div>
          </div>
        ))}
      </div>

      <div className="fx-footer">
        <span>{items.length} item{items.length === 1 ? "" : "s"}</span>
        <span style={{ flex: 1 }} />
        {selected && <span className="mono" style={{ color: "var(--fg-2)" }}>{path}/{selected}</span>}
      </div>

      <style>{`
        .fx-widget { display: flex; flex-direction: column; flex: 1; min-height: 0; font-size: var(--t-sm); }

        .fx-toolbar {
          display: flex; align-items: center; gap: 6px;
          padding: 5px 8px;
          border-bottom: 1px solid var(--glass-line);
          flex-shrink: 0;
        }
        .fx-toolbar .icon-btn { width: 26px; height: 26px; }
        .fx-toolbar .icon-btn svg { width: 12px; height: 12px; }
        .fx-toolbar .icon-btn.on { background: oklch(from var(--accent) l c h / 0.18); color: var(--accent); }

        .fx-crumbs {
          display: flex; align-items: center; gap: 1px;
          flex: 1; min-width: 0;
          padding: 0 4px;
          overflow: hidden;
        }
        .fx-crumb {
          padding: 3px 7px;
          border-radius: 4px;
          color: var(--fg-2);
          font-size: var(--t-sm);
          white-space: nowrap;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .fx-crumb:hover { background: var(--bg-2); color: var(--fg-0); }
        .fx-crumb.current { color: var(--fg-0); }
        .fx-sep { color: var(--fg-3); padding: 0 1px; user-select: none; }

        .fx-search {
          display: flex; align-items: center; gap: 5px;
          padding: 0 8px;
          height: 24px;
          background: var(--bg-2);
          border-radius: 4px;
          width: 140px;
        }
        .fx-search svg { color: var(--fg-3); flex-shrink: 0; }
        .fx-search input {
          background: transparent; border: 0; outline: 0;
          color: var(--fg-0);
          font: inherit; font-size: var(--t-xs);
          flex: 1; min-width: 0;
        }

        .fx-actions { display: flex; gap: 2px; }

        .fx-xfer {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 10px;
          background: oklch(from var(--accent) l c h / 0.1);
          border-bottom: 1px solid oklch(from var(--accent) l c h / 0.25);
          font-size: var(--t-xs);
          animation: slideUp 200ms var(--ease-out);
        }
        .fx-xfer.done { background: oklch(from oklch(0.74 0.16 150) l c h / 0.12); border-bottom-color: oklch(from oklch(0.74 0.16 150) l c h / 0.3); }
        .fx-xfer-icon { color: var(--accent); display: inline-flex; }
        .fx-xfer.done .fx-xfer-icon { color: oklch(0.74 0.16 150); }
        .fx-xfer-name { color: var(--fg-1); font-family: var(--font-mono); font-size: 11px; }
        .fx-xfer-bar {
          flex: 1; height: 4px; border-radius: 2px;
          background: oklch(from var(--accent) l c h / 0.18); overflow: hidden;
        }
        .fx-xfer.done .fx-xfer-bar { background: oklch(from oklch(0.74 0.16 150) l c h / 0.2); }
        .fx-xfer-bar > div { height: 100%; background: var(--accent); transition: width 120ms linear; }
        .fx-xfer.done .fx-xfer-bar > div { background: oklch(0.74 0.16 150); }
        .fx-xfer-pct { color: var(--fg-2); font-variant-numeric: tabular-nums; min-width: 32px; text-align: right; }

        .fx-listhead {
          display: flex; gap: 8px;
          padding: 5px 12px 5px 12px;
          border-bottom: 1px solid var(--glass-line);
          background: oklch(from var(--bg-1) l c h / 0.6);
          flex-shrink: 0;
        }
        .fx-h {
          color: var(--fg-3);
          font-size: var(--t-xs);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          text-align: left;
          padding: 0;
        }
        .fx-h:hover { color: var(--fg-1); }
        .fx-h.on { color: var(--fg-0); }
        .fx-h.on::after { content: " ↑"; }
        .fx-h.on.desc::after { content: " ↓"; }

        .fx-list { flex: 1; overflow: auto; min-height: 0; }

        .fx-row {
          display: flex; gap: 8px;
          padding: 4px 12px;
          align-items: center;
          cursor: default;
          border-radius: 0;
          color: var(--fg-1);
          line-height: 1.5;
        }
        .fx-row:hover { background: oklch(from var(--bg-1) l c h / 0.5); }
        .fx-row.sel { background: oklch(from var(--accent) l c h / 0.18); color: var(--fg-0); }
        .fx-row.dir .fx-name { color: var(--fg-0); font-weight: 500; }
        .fx-row.link .fx-name { color: oklch(0.78 0.13 220); font-style: italic; }

        .fx-cell { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .fx-cell.name { display: flex; align-items: center; gap: 8px; }
        .fx-cell.mono { font-family: var(--font-mono); font-size: 11px; }

        .fx-link { color: var(--fg-3); font-style: italic; margin-left: 4px; }

        .fx-empty {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 12px;
          padding: 60px 20px;
          color: var(--fg-3);
        }

        .fx-footer {
          display: flex; align-items: center; gap: 8px;
          padding: 4px 12px;
          border-top: 1px solid var(--glass-line);
          font-size: var(--t-xs);
          color: var(--fg-3);
          background: oklch(from var(--bg-1) l c h / 0.4);
          flex-shrink: 0;
        }
        .fx-footer .mono { font-family: var(--font-mono); font-size: 10.5px; }
      `}</style>
    </div>
  );
}

function FileIcon({ item }) {
  const sz = 14;
  if (item.type === "dir") {
    const isAndroid = ["Android", "data", "system", "framework", "app", "proc", "dev"].includes(item.name);
    return (
      <svg width={sz} height={sz} viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
        <path d="M 1.5 4 L 1.5 13 Q 1.5 14 2.5 14 L 13.5 14 Q 14.5 14 14.5 13 L 14.5 6 Q 14.5 5 13.5 5 L 7 5 L 5.5 3 L 2.5 3 Q 1.5 3 1.5 4 Z"
          fill={isAndroid ? "oklch(0.7 0.13 150)" : "oklch(0.78 0.1 80)"}
          fillOpacity="0.85"
          stroke="oklch(0.4 0.05 80)"
          strokeWidth="0.5"
          strokeOpacity="0.4" />
      </svg>
    );
  }
  if (item.type === "link") {
    return (
      <svg width={sz} height={sz} viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
        <path d="M 6 9 L 4 11 Q 2 13 4 15 Q 6 17 8 15 L 10 13" fill="none" stroke="oklch(0.78 0.13 220)" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M 10 7 L 12 5 Q 14 3 12 1 Q 10 -1 8 1 L 6 3" fill="none" stroke="oklch(0.78 0.13 220)" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  // File — color by extension
  const ext = item.name.split(".").pop().toLowerCase();
  const colorMap = {
    apk: "oklch(0.7 0.13 150)",
    jpg: "oklch(0.78 0.13 30)", jpeg: "oklch(0.78 0.13 30)", png: "oklch(0.78 0.13 30)",
    pdf: "oklch(0.7 0.16 25)",
    json: "oklch(0.78 0.13 80)",
    md: "oklch(0.78 0.13 220)", txt: "oklch(0.78 0.13 220)",
    zip: "oklch(0.78 0.13 80)",
    perfetto: "oklch(0.78 0.16 320)",
    mp3: "oklch(0.78 0.16 320)",
    bin: "oklch(0.7 0.05 280)", dat: "oklch(0.7 0.05 280)", tmp: "oklch(0.7 0.05 280)",
  };
  const color = colorMap[ext] || "oklch(0.65 0.02 280)";
  return (
    <svg width={sz} height={sz} viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      <path d="M 3 1.5 L 3 14.5 Q 3 15 3.5 15 L 12.5 15 Q 13 15 13 14.5 L 13 5 L 9 1.5 Z"
        fill={color} fillOpacity="0.5" stroke={color} strokeWidth="0.8" />
      <path d="M 9 1.5 L 9 5 L 13 5" fill="none" stroke={color} strokeWidth="0.8" />
    </svg>
  );
}

window.FilesWidget = FilesWidget;
