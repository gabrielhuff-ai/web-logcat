// WebLogcat — Empty state (no device connected)

const EmptyState = ({ onConnect, onUseFakeData }) => {
  const [connecting, setConnecting] = React.useState(false);
  const [step, setStep] = React.useState(0); // 0 idle, 1 dialog, 2 authorize, 3 done

  const startConnect = () => {
    setConnecting(true);
    setStep(1);
    setTimeout(() => setStep(2), 900);
    setTimeout(() => setStep(3), 2400);
    setTimeout(() => onConnect(), 3000);
  };

  return (
    <div className="empty">
      <div className="empty-grid" aria-hidden="true" />

      <div className="empty-card">
        <div className="empty-illustration">
          <DeviceIllustration phase={step} />
        </div>

        <div className="empty-eyebrow">WEBLOGCAT</div>
        <h1 className="empty-title">No device connected</h1>
        <p className="empty-sub">
          Plug an Android device via USB and accept the debugging prompt.
          We'll stream logcat live, right here.
        </p>

        <div className="empty-actions">
          <button className="btn primary big" onClick={startConnect} disabled={connecting}>
            {connecting ? (
              <>
                <span className="dot-spinner" />
                {step === 1 && "Selecting device…"}
                {step === 2 && "Authorize on device…"}
                {step === 3 && "Connected"}
              </>
            ) : (
              <>
                <Icons.Usb size={16} />
                Connect a device
              </>
            )}
          </button>

          <div className="empty-or">
            or try the app with{" "}
            <button className="link" onClick={onUseFakeData} disabled={connecting}>
              fake data
            </button>
          </div>
        </div>

        <div className="empty-hint">
          <span className="kbd">⌘ K</span>
          to open the command palette,
          <span className="kbd">?</span>
          for shortcuts
        </div>
      </div>

      <style>{`
        .empty {
          position: absolute; inset: 0;
          display: grid; place-items: center;
          background: var(--bg-0);
          overflow: hidden;
        }
        .empty-grid {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(var(--line-soft) 1px, transparent 1px),
            linear-gradient(90deg, var(--line-soft) 1px, transparent 1px);
          background-size: 32px 32px;
          mask-image: radial-gradient(ellipse 60% 60% at 50% 50%, black 30%, transparent 80%);
          opacity: 0.5;
        }
        .empty-card {
          position: relative;
          width: min(560px, 92vw);
          padding: 56px 48px 36px;
          text-align: center;
          animation: slideUp 480ms var(--ease-out) both;
        }
        .empty-illustration {
          height: 140px;
          margin-bottom: 32px;
          display: grid; place-items: center;
        }
        .empty-eyebrow {
          font-size: var(--t-xs);
          letter-spacing: 0.18em;
          color: var(--accent-fg);
          margin-bottom: 12px;
        }
        .empty-title {
          font-size: var(--t-2xl);
          font-weight: 600;
          margin: 0 0 12px;
          letter-spacing: -0.02em;
          color: var(--fg-0);
        }
        .empty-sub {
          font-size: var(--t-md);
          color: var(--fg-2);
          margin: 0 auto 28px;
          max-width: 380px;
          line-height: 1.55;
        }
        .empty-actions {
          display: flex; flex-direction: column; align-items: center; gap: 14px;
          margin-bottom: 36px;
        }
        .btn.big { height: 44px; padding: 0 22px; font-size: var(--t-md); border-radius: 10px; min-width: 220px; justify-content: center; }
        .empty-or {
          font-size: var(--t-sm);
          color: var(--fg-2);
        }
        .link {
          color: var(--accent-fg);
          background: none; padding: 0; cursor: pointer;
          font: inherit;
          border-bottom: 1px dashed var(--accent-fg);
          transition: opacity var(--dur-fast) var(--ease-out);
        }
        .link:hover { opacity: 0.7; }
        .link:disabled { opacity: 0.4; cursor: not-allowed; }
        .empty-hint {
          font-size: var(--t-xs);
          color: var(--fg-3);
          letter-spacing: 0.04em;
        }
        .empty-hint .kbd { margin: 0 4px; }
        .dot-spinner {
          width: 10px; height: 10px;
          border-radius: 50%;
          background: currentColor;
          animation: pulse 1.2s var(--ease-in-out) infinite;
        }
      `}</style>
    </div>
  );
};

const DeviceIllustration = ({ phase = 0 }) => {
  // animated phone + cable
  return (
    <svg width="220" height="140" viewBox="0 0 220 140" fill="none" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="screenGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      {/* USB-A on the left */}
      <g style={{ transition: "transform 600ms var(--ease-spring)", transform: phase >= 1 ? "translateX(36px)" : "translateX(0)" }}>
        <rect x="6" y="58" width="36" height="24" rx="2" fill="var(--bg-3)" stroke="var(--line)" />
        <rect x="14" y="64" width="22" height="3" fill="var(--fg-3)" />
        <rect x="14" y="71" width="22" height="3" fill="var(--fg-3)" />
        {/* cable */}
        <path d={`M 42 70 Q 70 ${phase >= 1 ? 70 : 90} 100 70`} stroke="var(--fg-2)" strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>

      {/* Phone */}
      <g style={{ transform: "translateX(80px)" }}>
        <rect x="20" y="14" width="80" height="120" rx="12" fill="var(--bg-2)" stroke="var(--line)" strokeWidth="1.5" />
        <rect x="26" y="22" width="68" height="100" rx="6" fill="url(#screenGrad)" />
        {/* Status bar dots */}
        <circle cx="60" cy="28" r="1.5" fill="var(--fg-3)" />
        <rect x="80" y="26" width="10" height="4" rx="1" fill="var(--fg-3)" />
        {/* Authorize dialog */}
        {phase >= 2 && (
          <g style={{ animation: "slideUp 280ms var(--ease-out) both" }}>
            <rect x="30" y="50" width="60" height="48" rx="4" fill="var(--bg-1)" stroke="var(--line)" />
            <rect x="34" y="56" width="36" height="3" rx="1" fill="var(--fg-1)" />
            <rect x="34" y="62" width="48" height="2" rx="1" fill="var(--fg-3)" />
            <rect x="34" y="66" width="44" height="2" rx="1" fill="var(--fg-3)" />
            <rect x="34" y="86" width="22" height="8" rx="2" fill={phase >= 3 ? "var(--accent)" : "var(--bg-3)"} />
            <rect x="60" y="86" width="22" height="8" rx="2" fill="var(--bg-3)" />
          </g>
        )}
        {phase >= 3 && (
          <g style={{ animation: "fadeIn 240ms var(--ease-out) both" }}>
            <circle cx="60" cy="72" r="14" fill="var(--accent)" opacity="0.18" />
            <path d="M 53 72 L 58 77 L 67 67" stroke="var(--accent)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )}
      </g>
    </svg>
  );
};

window.EmptyState = EmptyState;
