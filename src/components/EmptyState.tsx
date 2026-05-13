// Pre-connection screen with animated USB-cable + phone illustration.
// Ported from design/v1/source/empty-state.jsx.
//
// The button text follows the *real* connect lifecycle (phases reported
// by lib/adb.ts via the setStep callback) rather than the design's fixed
// setTimeout schedule — so users see the chooser appear immediately and
// see "Authorize on device" only when AUTH is actually in flight. If the
// user cancels the chooser, `onConnect` rejects and we reset the button
// state instead of staying stuck on "Connected".

import { useEffect, useState } from 'react';
import { APP_VERSION } from '../version';
import { SplitConnectButton } from './SplitConnectButton';
import { WdpDialog } from './WdpDialog';
import { probeWdpReachable, type WdpDevice } from '../lib/wdp';

export type ConnectStep = 0 | 1 | 2 | 3; // idle / requesting / authorizing / connected

export interface EmptyStateProps {
  /**
   * Initiates a real WebUSB+ADB connect. Resolves when the device is
   * fully connected (at which point the parent will swap us out for the
   * main view), rejects if the user cancels or the handshake fails.
   *
   * Receives a `setStep` callback that the connect implementation calls
   * as it progresses through phases.
   */
  onConnect: (setStep: (step: ConnectStep) => void) => Promise<void>;
  onUseFakeData: () => void;
  /** Connect to a device exposed by the Web Device Proxy daemon. */
  onConnectWdp: (device: WdpDevice) => Promise<void>;
}

export function EmptyState({ onConnect, onUseFakeData, onConnectWdp }: EmptyStateProps) {
  const [connecting, setConnecting] = useState(false);
  const [step, setStep] = useState<ConnectStep>(0);
  const [wdpOpen, setWdpOpen] = useState(false);
  // Runtime availability probe — when WDP is reachable on
  // 127.0.0.1:9167 the primary button defaults to the proxy flow,
  // since a running WDP daemon implies adb-server has the USB claim
  // anyway and WebUSB would fail. When the probe times out we default
  // to WebUSB. The arrow menu always exposes both transports.
  const [preferred, setPreferred] = useState<'usb' | 'proxy'>('usb');

  useEffect(() => {
    let cancelled = false;
    void probeWdpReachable().then((reachable) => {
      if (cancelled) return;
      setPreferred(reachable ? 'proxy' : 'usb');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const startWebUsbConnect = async () => {
    setConnecting(true);
    // Pre-set step=1 so the button updates the moment the chooser is
    // about to open, even before lib/adb.ts has a chance to fire its
    // own onPhase('requesting').
    setStep(1);
    try {
      await onConnect(setStep);
      // success → parent unmounts us; no need to reset state here
    } catch {
      setConnecting(false);
      setStep(0);
    }
  };

  const onPrimary = () => {
    if (preferred === 'proxy') {
      setWdpOpen(true);
    } else {
      void startWebUsbConnect();
    }
  };

  const onDeviceConnect = (d: WdpDevice) => {
    setConnecting(true);
    setStep(2);
    setWdpOpen(false);
    onConnectWdp(d).catch(() => {
      setConnecting(false);
      setStep(0);
    });
  };

  return (
    <div className="empty">
      <div className="empty-grid" aria-hidden="true" />

      <div className="empty-card">
        <div className="empty-illustration">
          <DeviceIllustration phase={step} />
        </div>

        <div className="empty-eyebrow">
          WEBLOGCAT <span className="empty-alpha" aria-label="Alpha release">alpha</span>
        </div>
        <h1 className="empty-title">No device connected</h1>
        <p className="empty-sub">
          Plug an Android device via USB and accept the debugging prompt. We'll stream logcat
          live, right here.
        </p>

        <div className="empty-actions">
          <SplitConnectButton
            busy={connecting}
            step={step}
            preferred={preferred}
            onPrimary={onPrimary}
            onWebUsb={() => void startWebUsbConnect()}
            onProxy={() => setWdpOpen(true)}
          />

          <div className="empty-or">
            or try the app with{' '}
            <button className="link" onClick={onUseFakeData} disabled={connecting}>
              fake data
            </button>
          </div>
        </div>

        <div className="empty-hint">
          <span className="kbd">⌘ F</span>
          to search,
          <span className="kbd">?</span>
          for keyboard shortcuts
        </div>
      </div>
      <div className="empty-version">v{APP_VERSION}</div>

      <WdpDialog
        open={wdpOpen}
        busy={connecting}
        onConnect={onDeviceConnect}
        onClose={() => setWdpOpen(false)}
      />
    </div>
  );
}

function DeviceIllustration({ phase }: { phase: number }) {
  return (
    <svg width="220" height="140" viewBox="0 0 220 140" fill="none" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="screenGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      {/* USB-A on the left */}
      <g
        style={{
          transition: 'transform 600ms var(--ease-spring)',
          transform: phase >= 1 ? 'translateX(36px)' : 'translateX(0)',
        }}
      >
        <rect x="6" y="58" width="36" height="24" rx="2" fill="var(--bg-3)" stroke="var(--line)" />
        <rect x="14" y="64" width="22" height="3" fill="var(--fg-3)" />
        <rect x="14" y="71" width="22" height="3" fill="var(--fg-3)" />
        <path
          d={`M 42 70 Q 70 ${phase >= 1 ? 70 : 90} 100 70`}
          stroke="var(--fg-2)"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
      </g>
      {/* Phone */}
      <g style={{ transform: 'translateX(80px)' }}>
        <rect
          x="20"
          y="14"
          width="80"
          height="120"
          rx="12"
          fill="var(--bg-2)"
          stroke="var(--line)"
          strokeWidth="1.5"
        />
        <rect x="26" y="22" width="68" height="100" rx="6" fill="url(#screenGrad)" />
        <circle cx="60" cy="28" r="1.5" fill="var(--fg-3)" />
        <rect x="80" y="26" width="10" height="4" rx="1" fill="var(--fg-3)" />
        {phase >= 2 && (
          <g style={{ animation: 'slideUp 280ms var(--ease-out) both' }}>
            <rect
              x="30"
              y="50"
              width="60"
              height="48"
              rx="4"
              fill="var(--bg-1)"
              stroke="var(--line)"
            />
            <rect x="34" y="56" width="36" height="3" rx="1" fill="var(--fg-1)" />
            <rect x="34" y="62" width="48" height="2" rx="1" fill="var(--fg-3)" />
            <rect x="34" y="66" width="44" height="2" rx="1" fill="var(--fg-3)" />
            <rect
              x="34"
              y="86"
              width="22"
              height="8"
              rx="2"
              fill={phase >= 3 ? 'var(--accent)' : 'var(--bg-3)'}
            />
            <rect x="60" y="86" width="22" height="8" rx="2" fill="var(--bg-3)" />
          </g>
        )}
        {phase >= 3 && (
          <g style={{ animation: 'fadeIn 240ms var(--ease-out) both' }}>
            <circle cx="60" cy="72" r="14" fill="var(--accent)" opacity="0.18" />
            <path
              d="M 53 72 L 58 77 L 67 67"
              stroke="var(--accent)"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        )}
      </g>
    </svg>
  );
}
