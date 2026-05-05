// Dumpsys widget — preset commands with parsed cards + raw output

const DUMPSYS_PRESETS = [
  { id: "battery", label: "battery", desc: "Power & charge state" },
  { id: "meminfo", label: "meminfo", desc: "Memory by process" },
  { id: "cpuinfo", label: "cpuinfo", desc: "CPU usage" },
  { id: "activity", label: "activity activities", desc: "Foreground / running activities" },
  { id: "package", label: "package", desc: "App packages" },
  { id: "wifi", label: "wifi", desc: "Wi-Fi state & networks" },
  { id: "connectivity", label: "connectivity", desc: "Network status" },
  { id: "power", label: "power", desc: "Wakelocks, sleep state" },
  { id: "gfxinfo", label: "gfxinfo", desc: "Frame timing for the foreground app" },
  { id: "input", label: "input", desc: "Input devices" },
  { id: "media_session", label: "media_session", desc: "Audio sessions" },
];

function rint(a, b) { return Math.floor(a + Math.random() * (b - a)); }

// Generate fake but realistic dumpsys output for each preset.
function dumpsysOutput(id) {
  if (id === "battery") {
    return [
      "Current Battery Service state:",
      "  AC powered: false",
      "  USB powered: true",
      "  Wireless powered: false",
      "  Max charging current: 1500000",
      "  Max charging voltage: 5000000",
      "  Charge counter: 3041000",
      "  status: 2",
      "  health: 2",
      "  present: true",
      "  level: 78",
      "  scale: 100",
      "  voltage: 4180",
      "  temperature: 312",
      "  technology: Li-ion",
      "  charge_time_remaining: 2700000",
    ].join("\n");
  }
  if (id === "meminfo") {
    const procs = window.LogGen?.PROCESSES || [];
    const lines = [
      "Applications Memory Usage (in Kilobytes):",
      "Uptime: 4,240,520 Realtime: 8,120,433",
      "",
      "Total PSS by process:",
    ];
    procs.forEach((p, i) => {
      const pss = rint(40_000, 280_000);
      lines.push(`  ${pss.toLocaleString().padStart(9)}K: ${p.pkg} (pid ${p.pid}${i === 0 ? " / activities" : ""})`);
    });
    lines.push("");
    lines.push("Total PSS by OOM adjustment:");
    lines.push("       420,182K: Native");
    lines.push("       312,508K: System");
    lines.push("       284,012K: Persistent");
    lines.push("       912,440K: Foreground");
    lines.push("       482,880K: Visible");
    lines.push("       340,228K: Cached");
    lines.push("");
    lines.push("Total RAM: 11,924,000K (status normal)");
    lines.push(" Free RAM:  4,202,440K");
    lines.push(" Used RAM:  7,610,212K");
    lines.push(" Lost RAM:    111,348K");
    return lines.join("\n");
  }
  if (id === "cpuinfo") {
    return [
      "Load: 1.42 / 1.18 / 0.92",
      "CPU usage from " + (rint(10, 60)) + "ms to " + (rint(8200, 8400)) + "ms ago (2024-12-12 14:12:08.310 to 2024-12-12 14:12:16.370):",
      "  18% 8412/com.example.shopapp: 14% user + 4% kernel / faults: 2,310 minor 2 major",
      "  12% 1421/com.android.systemui: 9% user + 3% kernel",
      "   8% 982/system_server: 5% user + 3% kernel",
      "   6% 4502/com.android.chrome: 5% user + 1% kernel",
      "   5% 5810/com.spotify.music: 3% user + 2% kernel",
      "   2% 2104/com.google.android.gms: 1% user + 1% kernel",
      "",
      " 56% TOTAL: 38% user + 14% kernel + 3% iowait + 1% softirq",
    ].join("\n");
  }
  if (id === "activity") {
    return [
      "ACTIVITY MANAGER ACTIVITIES (dumpsys activity activities)",
      "  Resumed activity: ActivityRecord{a78ff21 u0 com.example.shopapp/.MainActivity t1024}",
      "  ResumedActivity: com.example.shopapp/.MainActivity",
      "",
      "  Display #0 (id=0):",
      "    Stack #1: type=home mode=fullscreen",
      "      Task id=1 type=home",
      "        ActivityRecord{0a1b2c3 u0 com.android.launcher3/.Launcher t1}",
      "    Stack #2: type=standard mode=fullscreen",
      "      Task id=1024 type=standard",
      "        ActivityRecord{a78ff21 u0 com.example.shopapp/.MainActivity t1024}",
      "        ActivityRecord{c2d3e4f u0 com.example.shopapp/.CartActivity t1024}",
    ].join("\n");
  }
  if (id === "package") {
    const procs = window.LogGen?.PROCESSES || [];
    return [
      "Packages:",
      ...procs.map(p =>
        `  Package [${p.pkg}] (uid=10${rint(100, 200)})\n    versionCode=${rint(100, 9999)} minSdk=24 targetSdk=34\n    flags=[ HAS_CODE ALLOW_CLEAR_USER_DATA ALLOW_BACKUP ]\n    signing=[ ${rint(1, 99)}:${rint(1000, 9999)}:${rint(1000, 9999)} ]`
      ),
    ].join("\n\n");
  }
  if (id === "wifi") {
    return [
      "Wi-Fi is enabled",
      "Stay-awake conditions: 3",
      "Mobile data state: 2",
      "Verbose logging is OFF",
      "",
      "Wi-Fi Connections:",
      "  ConnectedSSID: \"HomeWifi-5G\"",
      "  RSSI: -52 dBm",
      "  LinkSpeed: 866 Mbps",
      "  Frequency: 5180 MHz",
      "  IpAddress: 192.168.1." + rint(20, 250),
      "  MacAddress: 04:42:1a:** (randomized)",
      "  Score: 60",
      "",
      "Saved networks: 3",
      "  HomeWifi-5G    [WPA2-PSK][ESS]",
      "  Office         [WPA2-EAP][ESS]",
      "  CoffeeShop     [WPA2-PSK][ESS]",
    ].join("\n");
  }
  if (id === "connectivity") {
    return [
      "Active default network: 122 (WIFI)",
      "Currently active default network for: 0 [WIFI ()]",
      "Validated networks: WIFI 122",
      "",
      "NetworkAgentInfo [WIFI () - 122] {",
      "  capabilities: [ TRANSPORT_WIFI INTERNET NOT_RESTRICTED TRUSTED NOT_VPN VALIDATED ]",
      "  linkProperties: { InterfaceName: wlan0 LinkAddresses: [192.168.1." + rint(20, 250) + "/24, fe80::1/64] DnsAddresses: [8.8.8.8, 1.1.1.1] Domains: null }",
      "  score: Score{Policies : 0x40, KeepConnectedReason : NONE}",
      "}",
    ].join("\n");
  }
  if (id === "power") {
    return [
      "POWER MANAGER (dumpsys power)",
      "Power Manager State:",
      "  mIsPowered=true",
      "  mPlugType=2 (USB)",
      "  mBatteryLevel=78",
      "  mWakefulness=Awake",
      "  mDisplayState=ON",
      "",
      "Wake Locks: size=4",
      "  PARTIAL_WAKE_LOCK 'AlarmManager' (uid=1000)",
      "  PARTIAL_WAKE_LOCK 'NetworkStats' (uid=1000)",
      "  PARTIAL_WAKE_LOCK 'JobScheduler' (uid=1000)",
      "  FULL_WAKE_LOCK 'com.example.shopapp' (uid=10142)",
      "",
      "Suspend Blockers:",
      "  PowerManagerService.WakeLocks: ref count=4",
      "  PowerManagerService.Display: ref count=1",
    ].join("\n");
  }
  if (id === "gfxinfo") {
    return [
      "Applications Graphics Acceleration Info:",
      "Uptime: 4,240,520 Realtime: 8,120,433",
      "",
      "** Graphics info for pid 8412 [com.example.shopapp] **",
      "",
      "Stats since: 8120433ms ago",
      "Total frames rendered: 18,420",
      "Janky frames: 380 (2.06%)",
      "50th percentile: 7ms",
      "90th percentile: 12ms",
      "95th percentile: 18ms",
      "99th percentile: 32ms",
      "Number Missed Vsync: 18",
      "Number High input latency: 4",
      "Number Slow UI thread: 22",
      "Number Slow bitmap uploads: 3",
      "Number Slow issue draw commands: 12",
      "Number Frame deadline missed: 380",
    ].join("\n");
  }
  if (id === "input") {
    return [
      "INPUT MANAGER (dumpsys input)",
      "Input Devices:",
      "  Device 0: Goodix Capacitive TouchScreen",
      "    Generation: 5",
      "    Sources: 0x00001002 (touchscreen)",
      "    KeyboardType: 0",
      "    Identifier: bus=0x0018 vendor=0x27c6 product=0x0d40 version=0x0001",
      "  Device 1: gpio-keys",
      "    Sources: 0x00000101 (keyboard)",
      "    Has buttons: HOME, VOLUME_UP, VOLUME_DOWN, POWER",
    ].join("\n");
  }
  if (id === "media_session") {
    return [
      "MEDIA SESSION SERVICE (dumpsys media_session)",
      "  Sessions Stack - have 2 sessions:",
      "    media.session.MediaSession{a8b1c2d com.spotify.music/Spotify}",
      "      package=com.spotify.music",
      "      state=PlaybackState {state=3, position=124000, buffered position=240000, speed=1.0}",
      "      metadata=MediaMetadata{ TITLE=… ARTIST=… DURATION=210000 }",
      "    media.session.MediaSession{f3e4d5c com.example.shopapp/Notification}",
      "      package=com.example.shopapp",
      "      state=PlaybackState {state=0}",
    ].join("\n");
  }
  return "(no output)";
}

// Parsers — turn raw output into structured data when we have one
function parseBattery(raw) {
  const grab = (k) => {
    const m = raw.match(new RegExp("^\\s*" + k + ":\\s*(.+)$", "m"));
    return m ? m[1].trim() : null;
  };
  return {
    level: parseInt(grab("level")),
    scale: parseInt(grab("scale")) || 100,
    voltage_mV: parseInt(grab("voltage")),
    temp_dC: parseInt(grab("temperature")),
    statusCode: parseInt(grab("status")),
    healthCode: parseInt(grab("health")),
    technology: grab("technology"),
    powered: { ac: grab("AC powered") === "true", usb: grab("USB powered") === "true", wireless: grab("Wireless powered") === "true" },
    chargeRemainMs: parseInt(grab("charge_time_remaining")),
  };
}

function parseMeminfo(raw) {
  const procs = [];
  const lines = raw.split("\n");
  let inProcs = false;
  for (const line of lines) {
    if (/Total PSS by process:/i.test(line)) { inProcs = true; continue; }
    if (inProcs && /^Total PSS/.test(line)) break;
    const m = line.match(/^\s*([\d,]+)K:\s*(\S+)/);
    if (inProcs && m) procs.push({ kb: parseInt(m[1].replace(/,/g, "")), pkg: m[2] });
  }
  const total = (raw.match(/Total RAM:\s*([\d,]+)K/) || [])[1];
  const free = (raw.match(/Free RAM:\s*([\d,]+)K/) || [])[1];
  const used = (raw.match(/Used RAM:\s*([\d,]+)K/) || [])[1];
  return {
    procs: procs.sort((a, b) => b.kb - a.kb),
    totalKb: total ? parseInt(total.replace(/,/g, "")) : 0,
    freeKb: free ? parseInt(free.replace(/,/g, "")) : 0,
    usedKb: used ? parseInt(used.replace(/,/g, "")) : 0,
  };
}

function parseCpuinfo(raw) {
  const load = (raw.match(/Load:\s*([\d.]+)\s*\/\s*([\d.]+)\s*\/\s*([\d.]+)/) || []);
  const procs = [];
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s+(\d+)%\s+(\d+)\/(\S+):\s+(\d+)% user \+ (\d+)% kernel/);
    if (m) procs.push({ cpu: parseInt(m[1]), pid: parseInt(m[2]), pkg: m[3], user: parseInt(m[4]), kernel: parseInt(m[5]) });
  }
  const total = raw.match(/(\d+)% TOTAL:\s+(\d+)% user \+ (\d+)% kernel(?:\s+\+\s+(\d+)% iowait)?/);
  return {
    load: load.length ? { one: parseFloat(load[1]), five: parseFloat(load[2]), fifteen: parseFloat(load[3]) } : null,
    procs,
    total: total ? { total: parseInt(total[1]), user: parseInt(total[2]), kernel: parseInt(total[3]), iowait: parseInt(total[4] || "0") } : null,
  };
}

function parseGfxinfo(raw) {
  const grab = (k) => {
    const m = raw.match(new RegExp(k + ":\\s*([\\d,]+)(ms)?", "i"));
    return m ? parseInt(m[1].replace(/,/g, "")) : null;
  };
  const total = grab("Total frames rendered");
  const janky = (raw.match(/Janky frames:\s*([\d,]+)\s*\(([\d.]+)%\)/) || []);
  return {
    pkg: (raw.match(/\[(\S+)\]/) || [])[1],
    total: total,
    janky: janky.length ? parseInt(janky[1].replace(/,/g, "")) : null,
    jankyPct: janky.length ? parseFloat(janky[2]) : null,
    p50: grab("50th percentile"),
    p90: grab("90th percentile"),
    p95: grab("95th percentile"),
    p99: grab("99th percentile"),
    missVsync: grab("Number Missed Vsync"),
    slowUI: grab("Number Slow UI thread"),
  };
}

function parseWifi(raw) {
  const m = (k) => (raw.match(new RegExp(k + "[:\\s]+([^\n]+)")) || [])[1]?.trim();
  return {
    ssid: m("ConnectedSSID"),
    rssi: m("RSSI"),
    linkSpeed: m("LinkSpeed"),
    frequency: m("Frequency"),
    ip: m("IpAddress"),
  };
}

function DumpsysWidget({ device, initial }) {
  const [selected, setSelected] = React.useState(initial?.command || "battery");
  const [raw, setRaw] = React.useState(() => dumpsysOutput(initial?.command || "battery"));
  const [running, setRunning] = React.useState(false);
  const [view, setView] = React.useState("cards"); // cards | raw

  const run = React.useCallback((id) => {
    setSelected(id);
    setRunning(true);
    setTimeout(() => {
      setRaw(dumpsysOutput(id));
      setRunning(false);
    }, 350);
  }, []);

  return (
    <div className="ds-widget">
      <div className="ds-toolbar">
        <select value={selected} onChange={e => run(e.target.value)} className="ds-select">
          {DUMPSYS_PRESETS.map(p => (
            <option key={p.id} value={p.id}>dumpsys {p.label}</option>
          ))}
        </select>
        <button className="icon-btn tt" data-tt="Run again" onClick={() => run(selected)}>
          <Icons.Refresh size={13} />
        </button>
        <div style={{ flex: 1 }} />
        <div className="ds-view-seg">
          <button className={view === "cards" ? "on" : ""} onClick={() => setView("cards")}>Parsed</button>
          <button className={view === "raw" ? "on" : ""} onClick={() => setView("raw")}>Raw</button>
        </div>
      </div>

      <div className="ds-body">
        {running ? (
          <div className="ds-running">
            <div className="ds-spinner" />
            <span>Running dumpsys {selected}…</span>
          </div>
        ) : view === "cards" ? (
          <DumpsysCards id={selected} raw={raw} />
        ) : (
          <pre className="ds-raw">{raw}</pre>
        )}
      </div>

      <style>{`
        .ds-widget { display: flex; flex-direction: column; flex: 1; min-height: 0; }
        .ds-toolbar {
          display: flex; align-items: center; gap: 6px;
          padding: 6px 8px;
          border-bottom: 1px solid var(--glass-line);
          flex-shrink: 0;
        }
        .ds-toolbar .icon-btn { width: 26px; height: 26px; }
        .ds-toolbar .icon-btn svg { width: 13px; height: 13px; }
        .ds-select {
          height: 26px; padding: 0 24px 0 8px;
          border-radius: 5px;
          background: var(--bg-2);
          border: 1px solid var(--glass-line);
          color: var(--fg-0);
          font: inherit; font-size: var(--t-sm);
          appearance: none;
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='%23999' d='M0 0h10L5 6z'/></svg>");
          background-repeat: no-repeat; background-position: right 8px center;
          min-width: 220px;
        }
        .ds-view-seg {
          display: inline-flex; padding: 2px;
          background: var(--bg-2); border-radius: 6px;
        }
        .ds-view-seg button {
          padding: 4px 10px;
          border-radius: 4px;
          font-size: var(--t-xs);
          color: var(--fg-2);
        }
        .ds-view-seg button.on { background: var(--bg-0); color: var(--fg-0); box-shadow: var(--shadow-1); }

        .ds-body { flex: 1; min-height: 0; overflow: auto; }
        .ds-raw {
          margin: 0;
          padding: 12px 14px;
          font-family: var(--font-mono);
          font-size: 11.5px;
          line-height: 1.55;
          color: var(--fg-1);
          white-space: pre;
          tab-size: 2;
        }

        .ds-running {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 12px;
          height: 100%;
          color: var(--fg-3);
        }
        .ds-spinner {
          width: 22px; height: 22px;
          border-radius: 50%;
          border: 2px solid var(--bg-3);
          border-top-color: var(--accent);
          animation: spin 700ms linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .ds-cards { padding: 12px; display: grid; gap: 10px; }
        .ds-card {
          padding: 12px 14px;
          background: oklch(from var(--bg-1) l c h / 0.5);
          border: 1px solid var(--glass-line);
          border-radius: var(--r-md);
          animation: slideUp 200ms var(--ease-out) both;
        }
        .ds-card-head {
          font-size: var(--t-xs);
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--fg-3);
          margin-bottom: 8px;
        }
        .ds-card-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 4px 0;
          font-size: var(--t-sm);
        }
        .ds-card-row .k { color: var(--fg-2); }
        .ds-card-row .v {
          color: var(--fg-0);
          font-variant-numeric: tabular-nums;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}

function DumpsysCards({ id, raw }) {
  if (id === "battery") return <BatteryCards data={parseBattery(raw)} raw={raw} />;
  if (id === "meminfo") return <MeminfoCards data={parseMeminfo(raw)} />;
  if (id === "cpuinfo") return <CpuinfoCards data={parseCpuinfo(raw)} />;
  if (id === "gfxinfo") return <GfxinfoCards data={parseGfxinfo(raw)} />;
  if (id === "wifi") return <WifiCards data={parseWifi(raw)} raw={raw} />;
  // Generic fallback: show raw with a hint
  return (
    <div className="ds-cards">
      <div className="ds-card">
        <div className="ds-card-head">Output</div>
        <div style={{ fontSize: "var(--t-xs)", color: "var(--fg-3)", marginBottom: 8 }}>
          No structured view for this command — showing raw output.
        </div>
        <pre className="ds-raw" style={{ padding: 0 }}>{raw}</pre>
      </div>
    </div>
  );
}

const STATUS_MAP = { 1: "Unknown", 2: "Charging", 3: "Discharging", 4: "Not charging", 5: "Full" };
const HEALTH_MAP = { 1: "Unknown", 2: "Good", 3: "Overheat", 4: "Dead", 5: "Over voltage", 6: "Failure", 7: "Cold" };

function BatteryCards({ data, raw }) {
  const pct = data.level / data.scale * 100;
  const tempC = (data.temp_dC || 0) / 10;
  const remainMin = Math.round((data.chargeRemainMs || 0) / 60000);
  return (
    <div className="ds-cards">
      <div className="ds-card">
        <div className="ds-card-head">Charge</div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <BatteryGlyph pct={pct} charging={data.statusCode === 2} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1, color: "var(--fg-0)" }}>
              {Math.round(pct)}<span style={{ fontSize: 14, color: "var(--fg-2)", fontWeight: 500 }}>%</span>
            </div>
            <div style={{ fontSize: "var(--t-sm)", color: "var(--fg-2)", marginTop: 4 }}>
              {STATUS_MAP[data.statusCode] || "—"}{data.powered.usb ? " · USB" : ""}{data.powered.ac ? " · AC" : ""}{data.powered.wireless ? " · Wireless" : ""}
            </div>
            {remainMin > 0 && data.statusCode === 2 && (
              <div style={{ fontSize: "var(--t-xs)", color: "var(--fg-3)", marginTop: 2 }}>
                ≈ {Math.floor(remainMin / 60)}h {remainMin % 60}m until full
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="ds-card">
        <div className="ds-card-head">Health</div>
        <div className="ds-card-row"><span className="k">State</span><span className="v">{HEALTH_MAP[data.healthCode] || "—"}</span></div>
        <div className="ds-card-row"><span className="k">Temperature</span><span className="v" style={{ color: tempC > 38 ? "var(--lvl-w-fg)" : "var(--fg-0)" }}>{tempC.toFixed(1)}°C</span></div>
        <div className="ds-card-row"><span className="k">Voltage</span><span className="v">{(data.voltage_mV / 1000).toFixed(2)} V</span></div>
        <div className="ds-card-row"><span className="k">Technology</span><span className="v">{data.technology || "—"}</span></div>
      </div>
    </div>
  );
}

function BatteryGlyph({ pct, charging }) {
  const fillW = Math.max(2, Math.round(pct * 0.66));
  const color = pct < 15 ? "var(--lvl-e-fg)" : pct < 30 ? "var(--lvl-w-fg)" : "oklch(0.74 0.16 150)";
  return (
    <svg width="76" height="40" viewBox="0 0 76 40">
      <rect x="2" y="6" width="68" height="28" rx="5" fill="none" stroke="var(--fg-2)" strokeWidth="2" />
      <rect x="71" y="14" width="4" height="12" rx="1" fill="var(--fg-2)" />
      <rect x="6" y="10" width={fillW} height="20" rx="2" fill={color} style={{ transition: "width 400ms var(--ease-out)" }} />
      {charging && (
        <path d="M 36 12 L 30 22 H 36 L 32 30 L 42 18 H 36 Z"
          fill="oklch(1 0 0 / 0.85)" stroke="oklch(0 0 0 / 0.4)" strokeWidth="0.5" />
      )}
    </svg>
  );
}

function MeminfoCards({ data }) {
  const totalGB = data.totalKb / 1024 / 1024;
  const usedGB = data.usedKb / 1024 / 1024;
  const freeGB = data.freeKb / 1024 / 1024;
  const top = data.procs.slice(0, 8);
  const max = Math.max(1, ...top.map(p => p.kb));
  return (
    <div className="ds-cards">
      <div className="ds-card">
        <div className="ds-card-head">Memory</div>
        <div className="ds-card-row"><span className="k">Total RAM</span><span className="v">{totalGB.toFixed(1)} GB</span></div>
        <div className="ds-card-row"><span className="k">Used</span><span className="v">{usedGB.toFixed(1)} GB</span></div>
        <div className="ds-card-row"><span className="k">Free</span><span className="v">{freeGB.toFixed(1)} GB</span></div>
        <div style={{ marginTop: 8, height: 8, borderRadius: 4, overflow: "hidden", background: "var(--bg-2)", display: "flex" }}>
          <div style={{ width: `${(usedGB / totalGB) * 100}%`, background: "oklch(0.74 0.13 220)" }} />
          <div style={{ width: `${(freeGB / totalGB) * 100}%`, background: "oklch(0.74 0.16 150)", opacity: 0.5 }} />
        </div>
      </div>
      <div className="ds-card">
        <div className="ds-card-head">Top processes by PSS</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {top.map(p => (
            <div key={p.pkg} style={{ fontSize: "var(--t-sm)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.pkg}</span>
                <span style={{ color: "var(--fg-2)", fontVariantNumeric: "tabular-nums" }}>{(p.kb / 1024).toFixed(1)} MB</span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: "var(--bg-2)" }}>
                <div style={{ width: `${(p.kb / max) * 100}%`, height: "100%", borderRadius: 2, background: "var(--accent)", opacity: 0.8 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CpuinfoCards({ data }) {
  if (!data.total) return <div className="ds-cards"><div className="ds-card">No CPU data parsed.</div></div>;
  return (
    <div className="ds-cards">
      <div className="ds-card">
        <div className="ds-card-head">Load average</div>
        <div style={{ display: "flex", justifyContent: "space-around", padding: "6px 0" }}>
          {[
            { l: "1m", v: data.load?.one },
            { l: "5m", v: data.load?.five },
            { l: "15m", v: data.load?.fifteen },
          ].map(x => (
            <div key={x.l} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--fg-0)" }}>{x.v?.toFixed(2) ?? "—"}</div>
              <div style={{ fontSize: "var(--t-xs)", color: "var(--fg-3)", letterSpacing: ".1em" }}>{x.l}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="ds-card">
        <div className="ds-card-head">CPU usage · {data.total.total}% total</div>
        <div className="ds-card-row"><span className="k">User</span><span className="v">{data.total.user}%</span></div>
        <div className="ds-card-row"><span className="k">Kernel</span><span className="v">{data.total.kernel}%</span></div>
        <div className="ds-card-row"><span className="k">I/O wait</span><span className="v">{data.total.iowait}%</span></div>
      </div>
      <div className="ds-card">
        <div className="ds-card-head">Top processes</div>
        {data.procs.slice(0, 8).map(p => {
          const max = Math.max(1, ...data.procs.map(q => q.cpu));
          return (
            <div key={p.pid} style={{ marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--t-sm)" }}>
                <span style={{ color: "var(--fg-1)" }}>{p.pkg} <span style={{ color: "var(--fg-3)" }}>({p.pid})</span></span>
                <span style={{ color: "var(--fg-0)", fontVariantNumeric: "tabular-nums" }}>{p.cpu}%</span>
              </div>
              <div style={{ height: 3, marginTop: 3, background: "var(--bg-2)", borderRadius: 2 }}>
                <div style={{ width: `${(p.cpu / max) * 100}%`, height: "100%", borderRadius: 2, background: "oklch(0.74 0.13 220)" }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GfxinfoCards({ data }) {
  const pcts = [
    { l: "p50", v: data.p50, target: 16 },
    { l: "p90", v: data.p90, target: 16 },
    { l: "p95", v: data.p95, target: 16 },
    { l: "p99", v: data.p99, target: 16 },
  ];
  return (
    <div className="ds-cards">
      <div className="ds-card">
        <div className="ds-card-head">Frame rendering — {data.pkg}</div>
        <div className="ds-card-row"><span className="k">Total frames</span><span className="v">{data.total?.toLocaleString()}</span></div>
        <div className="ds-card-row">
          <span className="k">Janky frames</span>
          <span className="v" style={{ color: data.jankyPct > 5 ? "var(--lvl-w-fg)" : "var(--fg-0)" }}>
            {data.janky?.toLocaleString()} ({data.jankyPct?.toFixed(2)}%)
          </span>
        </div>
      </div>
      <div className="ds-card">
        <div className="ds-card-head">Frame time percentiles</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, padding: "4px 0" }}>
          {pcts.map(x => (
            <div key={x.l} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: x.v > x.target ? "var(--lvl-w-fg)" : "var(--fg-0)" }}>{x.v}<span style={{ fontSize: 11, color: "var(--fg-3)" }}>ms</span></div>
              <div style={{ fontSize: "var(--t-xs)", color: "var(--fg-3)" }}>{x.l}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: "var(--t-xs)", color: "var(--fg-3)", marginTop: 8, textAlign: "center" }}>
          target: 16ms (60fps)
        </div>
      </div>
      <div className="ds-card">
        <div className="ds-card-head">Stalls</div>
        <div className="ds-card-row"><span className="k">Missed Vsync</span><span className="v">{data.missVsync}</span></div>
        <div className="ds-card-row"><span className="k">Slow UI thread</span><span className="v">{data.slowUI}</span></div>
      </div>
    </div>
  );
}

function WifiCards({ data, raw }) {
  return (
    <div className="ds-cards">
      <div className="ds-card">
        <div className="ds-card-head">Connected network</div>
        <div className="ds-card-row"><span className="k">SSID</span><span className="v">{data.ssid || "—"}</span></div>
        <div className="ds-card-row"><span className="k">Signal</span><span className="v">{data.rssi || "—"}</span></div>
        <div className="ds-card-row"><span className="k">Link speed</span><span className="v">{data.linkSpeed || "—"}</span></div>
        <div className="ds-card-row"><span className="k">Frequency</span><span className="v">{data.frequency || "—"}</span></div>
        <div className="ds-card-row"><span className="k">IP</span><span className="v">{data.ip || "—"}</span></div>
      </div>
    </div>
  );
}

window.DumpsysWidget = DumpsysWidget;
