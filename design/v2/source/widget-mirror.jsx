// Screen mirror widget — browser-based scrcpy-like view

// Simulated current "app on screen" — a shopping app home screen
function MirrorAppFrame({ time, taps }) {
  return (
    <svg viewBox="0 0 360 760" preserveAspectRatio="xMidYMid meet" className="mirror-svg" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="mr-banner" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="oklch(0.55 0.18 30)" />
          <stop offset="100%" stopColor="oklch(0.42 0.16 350)" />
        </linearGradient>
        <linearGradient id="mr-card1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.78 0.14 80)" />
          <stop offset="100%" stopColor="oklch(0.65 0.18 60)" />
        </linearGradient>
        <linearGradient id="mr-card2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.72 0.13 220)" />
          <stop offset="100%" stopColor="oklch(0.55 0.18 250)" />
        </linearGradient>
        <linearGradient id="mr-card3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.78 0.13 150)" />
          <stop offset="100%" stopColor="oklch(0.6 0.16 165)" />
        </linearGradient>
        <clipPath id="mr-clip"><rect x="0" y="0" width="360" height="760" rx="0" /></clipPath>
      </defs>

      {/* Wallpaper */}
      <rect x="0" y="0" width="360" height="760" fill="oklch(0.13 0.02 270)" />

      <g clipPath="url(#mr-clip)">
        {/* Status bar */}
        <rect x="0" y="0" width="360" height="32" fill="oklch(0.1 0.02 270)" />
        <text x="20" y="21" fill="white" fontSize="12" fontWeight="600" fontFamily="ui-sans-serif, system-ui">{time}</text>
        <g transform="translate(310, 14)">
          <text x="0" y="7" fill="white" fontSize="9.5" fontFamily="ui-sans-serif">5G</text>
          <rect x="22" y="2" width="20" height="11" rx="2" fill="none" stroke="white" strokeWidth="0.8" />
          <rect x="42" y="5" width="1.5" height="5" fill="white" />
          <rect x="24" y="4" width="14" height="7" rx="0.8" fill="white" />
        </g>

        {/* App bar */}
        <rect x="0" y="32" width="360" height="56" fill="oklch(0.16 0.04 30)" />
        <text x="20" y="68" fill="white" fontSize="20" fontWeight="700" fontFamily="ui-sans-serif">Shop</text>
        <circle cx="335" cy="60" r="14" fill="oklch(0.3 0.06 30)" />
        <circle cx="335" cy="60" r="14" fill="url(#mr-banner)" opacity="0.6" />
        <text x="335" y="64" textAnchor="middle" fill="white" fontSize="11" fontWeight="600">JS</text>

        {/* Search bar */}
        <rect x="16" y="100" width="328" height="40" rx="20" fill="oklch(0.22 0.02 270)" />
        <circle cx="36" cy="120" r="6" fill="none" stroke="oklch(0.6 0.04 270)" strokeWidth="1.4" />
        <line x1="40" y1="124" x2="44" y2="128" stroke="oklch(0.6 0.04 270)" strokeWidth="1.4" strokeLinecap="round" />
        <text x="56" y="125" fill="oklch(0.6 0.04 270)" fontSize="13" fontFamily="ui-sans-serif">Search products & brands</text>

        {/* Hero banner */}
        <rect x="16" y="156" width="328" height="148" rx="14" fill="url(#mr-banner)" />
        <text x="32" y="200" fill="white" fontSize="22" fontWeight="800" fontFamily="ui-sans-serif">Holiday Sale</text>
        <text x="32" y="222" fill="oklch(0.95 0.02 30)" fontSize="13" fontFamily="ui-sans-serif">Up to 60% off everything</text>
        <rect x="32" y="248" width="100" height="32" rx="16" fill="white" />
        <text x="82" y="269" textAnchor="middle" fill="oklch(0.45 0.18 30)" fontSize="12" fontWeight="700" fontFamily="ui-sans-serif">Shop now</text>
        {/* Decorative shapes */}
        <circle cx="290" cy="200" r="36" fill="white" opacity="0.18" />
        <circle cx="320" cy="260" r="22" fill="white" opacity="0.1" />

        {/* Categories chips */}
        <text x="20" y="334" fill="white" fontSize="14" fontWeight="700" fontFamily="ui-sans-serif">Categories</text>
        {["All", "Apparel", "Tech", "Home", "Beauty"].map((label, i) => {
          const x = 20 + i * 66;
          const active = i === 0;
          return (
            <g key={label}>
              <rect x={x} y={344} width="60" height="28" rx="14" fill={active ? "oklch(0.55 0.18 30)" : "oklch(0.2 0.02 270)"} />
              <text x={x + 30} y={362} textAnchor="middle" fill="white" fontSize="11" fontWeight="600" fontFamily="ui-sans-serif">{label}</text>
            </g>
          );
        })}

        {/* Product grid */}
        {[
          { x: 16, y: 392, fill: "url(#mr-card1)", title: "Sneakers", price: "$89", brand: "Loop" },
          { x: 188, y: 392, fill: "url(#mr-card2)", title: "Headphones", price: "$219", brand: "AirPro" },
          { x: 16, y: 564, fill: "url(#mr-card3)", title: "Plant", price: "$34", brand: "Verde" },
          { x: 188, y: 564, fill: "oklch(0.32 0.06 30)", title: "Lamp", price: "$79", brand: "Glow" },
        ].map((c, i) => (
          <g key={i}>
            <rect x={c.x} y={c.y} width="156" height="160" rx="12" fill={c.fill} />
            <rect x={c.x} y={c.y + 116} width="156" height="44" rx="0" fill="oklch(0.16 0.03 270)" />
            <text x={c.x + 12} y={c.y + 134} fill="white" fontSize="12" fontWeight="700" fontFamily="ui-sans-serif">{c.title}</text>
            <text x={c.x + 12} y={c.y + 150} fill="oklch(0.7 0.04 30)" fontSize="10" fontFamily="ui-sans-serif">{c.brand}  ·  {c.price}</text>
            <circle cx={c.x + 138} cy={c.y + 16} r="12" fill="oklch(0 0 0 / 0.3)" />
            <path d={`M ${c.x + 132} ${c.y + 16} a 4 4 0 0 1 6 -2 a 4 4 0 0 1 6 2 c 0 4 -6 6 -6 6 s -6 -2 -6 -6 z`} fill="white" />
          </g>
        ))}

        {/* Bottom nav */}
        <rect x="0" y="708" width="360" height="52" fill="oklch(0.1 0.02 270)" />
        {[
          { l: "Home", active: true },
          { l: "Browse" },
          { l: "Cart" },
          { l: "Profile" },
        ].map((tab, i) => (
          <g key={tab.l}>
            <circle cx={45 + i * 90} cy={727} r="10" fill="none" stroke={tab.active ? "oklch(0.78 0.18 30)" : "oklch(0.5 0.04 270)"} strokeWidth="1.5" />
            <text x={45 + i * 90} y={747} textAnchor="middle" fill={tab.active ? "white" : "oklch(0.6 0.04 270)"} fontSize="10" fontWeight={tab.active ? 600 : 400} fontFamily="ui-sans-serif">{tab.l}</text>
          </g>
        ))}

        {/* Tap ripples */}
        {taps.map(t => (
          <g key={t.id}>
            <circle cx={t.x} cy={t.y} r={t.r} fill="none" stroke="oklch(0.78 0.18 30)" strokeWidth="2" opacity={t.op} />
            <circle cx={t.x} cy={t.y} r={4} fill="oklch(0.78 0.18 30)" opacity={Math.min(1, t.op * 1.5)} />
          </g>
        ))}
      </g>
    </svg>
  );
}

function MirrorWidget({ device, initial }) {
  const [time, setTime] = React.useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
  const [taps, setTaps] = React.useState([]);
  const [recording, setRecording] = React.useState(false);
  const [recordTime, setRecordTime] = React.useState(0);
  const tapIdRef = React.useRef(0);

  // Tick clock so it feels live
  React.useEffect(() => {
    const id = setInterval(() => {
      const d = new Date();
      setTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    }, 1500);
    return () => clearInterval(id);
  }, []);

  React.useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setRecordTime(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  // Animate taps
  React.useEffect(() => {
    if (taps.length === 0) return;
    const id = setInterval(() => {
      setTaps(prev => prev
        .map(t => ({ ...t, r: t.r + 2.5, op: t.op - 0.05 }))
        .filter(t => t.op > 0)
      );
    }, 30);
    return () => clearInterval(id);
  }, [taps.length]);

  const handleTap = (e) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const sx = (e.clientX - rect.left) / rect.width * 360;
    const sy = (e.clientY - rect.top) / rect.height * 760;
    const id = ++tapIdRef.current;
    setTaps(prev => [...prev, { id, x: sx, y: sy, r: 8, op: 0.9 }]);
  };

  const fmtRecord = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="mr-widget">
      <div className="mr-toolbar widget-bar">
        <div className="mr-hwgroup">
          <button className="mr-hw tt" data-tt="Back">
            <svg width="14" height="14" viewBox="0 0 16 16"><path d="M 11 3 L 5 8 L 11 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button className="mr-hw tt" data-tt="Home">
            <svg width="14" height="14" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
          </button>
          <button className="mr-hw tt" data-tt="Menu">
            <svg width="14" height="14" viewBox="0 0 16 16"><rect x="3" y="3" width="10" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
          </button>
        </div>
        <span className="mr-sep" />
        <div className="mr-hwgroup">
          <button className="mr-hw tt" data-tt="Volume up">
            <svg width="14" height="14" viewBox="0 0 16 16"><path d="M 4 6 L 4 10 L 7 10 L 11 13 L 11 3 L 7 6 Z" fill="currentColor" /><path d="M 13 6 Q 14.5 8 13 10" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
          </button>
          <button className="mr-hw tt" data-tt="Volume down">
            <svg width="14" height="14" viewBox="0 0 16 16"><path d="M 4 6 L 4 10 L 7 10 L 11 13 L 11 3 L 7 6 Z" fill="currentColor" /></svg>
          </button>
          <button className="mr-hw tt" data-tt="Power">
            <svg width="14" height="14" viewBox="0 0 16 16"><path d="M 8 3 L 8 8 M 5 5 Q 3 7 3 9 a 5 5 0 0 0 10 0 Q 13 7 11 5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
          </button>
        </div>
        <span className="mr-sep" />
        <div className="mr-hwgroup">
          <button className={"mr-hw tt " + (recording ? "rec" : "")} data-tt={recording ? "Stop recording" : "Record screen"} onClick={() => { setRecording(r => !r); setRecordTime(0); }}>
            {recording ? <Icons.Stop size={12} /> : <Icons.Record size={12} />}
          </button>
          <button className="mr-hw tt" data-tt="Screenshot">
            <Icons.Camera size={13} />
          </button>
        </div>
        <span style={{ flex: 1 }} />
      </div>

      <div className="mr-stage">
        <div className="mr-frame-wrap">
          <div className="mr-bezel">
            <div className="mr-screen" onClick={handleTap}>
              <MirrorAppFrame time={time} taps={taps} />
              {recording && (
                <div className="mr-recording-pill">
                  <span className="mr-rec-dot" />
                  REC · {fmtRecord(recordTime)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .mr-widget { display: flex; flex-direction: column; flex: 1; min-height: 0; }
        .mr-toolbar {
          display: flex; align-items: center; gap: 8px;
          padding: 5px 8px;
          border-bottom: 1px solid var(--glass-line);
          flex-shrink: 0;
        }
        .mr-hwgroup { display: inline-flex; align-items: center; gap: 4px; }
        .mr-sep {
          width: 1px;
          align-self: stretch;
          background: var(--glass-line);
          margin: 3px 4px;
        }
        .mr-hw.rec { color: oklch(0.7 0.22 25); animation: pulse 1.4s ease-in-out infinite; }

        .mr-stage {
          flex: 1; min-height: 0;
          display: flex; align-items: center; justify-content: center;
          background:
            radial-gradient(ellipse at center, oklch(from var(--bg-0) calc(l + 0.02) c h) 0%, var(--bg-0) 60%);
          padding: 18px;
          overflow: hidden;
        }

        .mr-frame-wrap {
          display: flex; align-items: center; justify-content: center;
          height: 100%;
          max-height: 100%;
        }

        .mr-bezel {
          background: oklch(0.08 0.005 270);
          border: 1px solid oklch(0.18 0.005 270);
          border-radius: 28px;
          padding: 10px;
          box-shadow:
            0 0 0 1px oklch(0.25 0.005 270 / 0.6),
            0 14px 32px oklch(0 0 0 / 0.45),
            inset 0 0 0 1px oklch(0 0 0 / 0.5);
          height: 100%;
          aspect-ratio: 360 / 760;
          max-width: 100%;
          display: flex;
          flex-direction: column;
        }
        .mr-screen {
          flex: 1;
          background: black;
          border-radius: 20px;
          overflow: hidden;
          position: relative;
          cursor: crosshair;
        }
        .mirror-svg { width: 100%; height: 100%; display: block; }

        .mr-recording-pill {
          position: absolute; top: 8px; right: 8px;
          display: inline-flex; align-items: center; gap: 5px;
          background: oklch(0 0 0 / 0.55);
          backdrop-filter: blur(8px);
          padding: 4px 8px;
          border-radius: 10px;
          color: white;
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.05em;
          border: 1px solid oklch(1 0 0 / 0.15);
        }
        .mr-rec-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: oklch(0.7 0.22 25);
          animation: pulse 1.4s ease-in-out infinite;
        }

        .mr-hw {
          width: 26px; height: 26px;
          display: inline-flex; align-items: center; justify-content: center;
          border-radius: 5px;
          color: var(--fg-2);
          background: transparent;
          border: 1px solid transparent;
        }
        .mr-hw:hover { color: var(--accent); background: var(--bg-2); border-color: var(--glass-line); }
        .mr-hw svg { width: 13px; height: 13px; }
      `}</style>
    </div>
  );
}

window.MirrorWidget = MirrorWidget;
