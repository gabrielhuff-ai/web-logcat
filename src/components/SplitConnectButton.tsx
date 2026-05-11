// Split connect button: primary CTA (triggers the user's preferred
// transport) + chevron arrow (opens a contextual menu to pick a
// specific transport). Modelled on the standard split-button pattern
// users will recognise from GitHub's "Star ▾".

import { useEffect, useRef, useState } from 'react';
import * as Icons from './Icons';
import type { ConnectStep } from './EmptyState';
import type { PreferredTransport } from '../lib/preferredTransport';

export interface SplitConnectButtonProps {
  /** Disable both halves of the split (e.g. while a connect is in flight). */
  busy: boolean;
  /** Phase reported by the active connect — drives the primary label. */
  step: ConnectStep;
  /** Which transport the primary button will use. */
  preferred: PreferredTransport;
  /** Primary click → run the preferred-transport connect. */
  onPrimary: () => void;
  /** Menu entry → start a WebUSB connect. */
  onWebUsb: () => void;
  /** Menu entry → open the Web Device Proxy dialog. */
  onProxy: () => void;
}

export function SplitConnectButton({
  busy,
  step,
  preferred,
  onPrimary,
  onWebUsb,
  onProxy,
}: SplitConnectButtonProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Outside-click + Escape dismiss — same pattern the topbar device
  // picker uses (src/components/Dashboard.tsx).
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (!root.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <div className="connect-split" ref={rootRef}>
      <button
        type="button"
        className="btn primary connect-primary"
        onClick={onPrimary}
        disabled={busy}
      >
        {busy ? (
          <>
            <span className="dot-spinner" />
            {step <= 1 && 'Connecting…'}
            {step === 2 && 'Authorize on device…'}
            {step === 3 && 'Connected'}
          </>
        ) : (
          <>
            {preferred === 'proxy' ? (
              <Icons.Stack size={16} />
            ) : (
              <Icons.Usb size={16} />
            )}
            Connect a device
          </>
        )}
      </button>
      <button
        type="button"
        className="btn primary connect-arrow"
        onClick={() => setMenuOpen((o) => !o)}
        disabled={busy}
        aria-label="Choose connection method"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        <Icons.Chevron size={13} />
      </button>
      {menuOpen && (
        <div className="connect-menu" role="menu" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            role="menuitem"
            className="connect-menu-item"
            onClick={() => {
              setMenuOpen(false);
              onWebUsb();
            }}
          >
            <span className="connect-menu-icon">
              <Icons.Usb size={14} />
            </span>
            <span className="connect-menu-label">
              <div className="connect-menu-title">Connect via WebUSB</div>
              <div className="connect-menu-sub">Zero install · Chromium · exclusive claim</div>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="connect-menu-item"
            onClick={() => {
              setMenuOpen(false);
              onProxy();
            }}
          >
            <span className="connect-menu-icon">
              <Icons.Stack size={14} />
            </span>
            <span className="connect-menu-label">
              <div className="connect-menu-title">
                Connect via Web Device Proxy
                <span className="connect-menu-badge" aria-label="experimental">
                  experimental
                </span>
              </div>
              <div className="connect-menu-sub">Coexists with adb · emulators · any browser</div>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
