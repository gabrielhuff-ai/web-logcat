// Modal dialog for the Web Device Proxy connect flow.
//
// Opened from the connect-button dropdown — `WdpDialog` owns the
// `WdpTracker` for its lifetime so the discovery probe (and any
// `/adb-json` activity) only happens while the user has explicitly
// chosen this transport. Closing the dialog tears the tracker down,
// which avoids the dormant-tracker-blocking-WebUSB issue users hit
// when the panel auto-loaded on the empty state.
//
// States:
//   - 'idle'           — probing on first open
//   - 'not-installed'  — daemon unreachable; show install hint + docs
//   - 'needs-approve'  — daemon up, origin not allowlisted; Authorize CTA
//   - 'connected'      — list of devices with per-row Authorize/Connect

import { useEffect, useRef, useState } from 'react';
import * as Icons from './Icons';
import {
  WDP_DOWNLOAD_URL,
  WdpTracker,
  openApprovePopup,
  wdpDeviceReady,
  wdpDeviceStatus,
  type WdpDevice,
} from '../lib/wdp';

const DOCS_URL = 'docs/features/connecting.html#device-proxy';

type DialogState =
  | { kind: 'idle' }
  | { kind: 'not-installed' }
  | { kind: 'needs-approve'; approveUrl: string }
  | { kind: 'connected'; devices: WdpDevice[]; version: string };

export interface WdpDialogProps {
  open: boolean;
  /** Forward a ready device to the parent's connectWdp callback. */
  onConnect: (device: WdpDevice) => void;
  onClose: () => void;
  /** Disable connect actions while another connect is already in flight. */
  busy?: boolean;
}

export function WdpDialog({ open, onConnect, onClose, busy }: WdpDialogProps) {
  const [state, setState] = useState<DialogState>({ kind: 'idle' });
  const [authorizingSerial, setAuthorizingSerial] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  // Latest snapshot, refreshed on every track-devices push. Used by the
  // per-device Authorize handler to read the *current* device state
  // after its popup closes (the closure value at click time is stale
  // once WDP flips PROXY_UNAUTHORIZED → ADB/DEVICE).
  const devicesRef = useRef<WdpDevice[]>([]);
  const approveResolveRef = useRef<((approved: boolean) => void) | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let snapshotVersion: string = '';

    setState({ kind: 'idle' });
    setAuthError(null);
    setAuthorizingSerial(null);

    const tracker = new WdpTracker({
      onSnapshot: (devices) => {
        if (cancelled) return;
        devicesRef.current = devices;
        setState({ kind: 'connected', devices, version: snapshotVersion });
      },
      onVersion: (v) => {
        snapshotVersion = v;
      },
      onOriginNotAllowlisted: (approveUrl) => {
        return new Promise<boolean>((resolve) => {
          if (cancelled) {
            resolve(false);
            return;
          }
          approveResolveRef.current = (approved: boolean) => {
            approveResolveRef.current = null;
            resolve(approved);
          };
          setState({ kind: 'needs-approve', approveUrl });
        });
      },
      onDisconnect: () => {
        if (cancelled) return;
        setState({ kind: 'not-installed' });
      },
    });

    void tracker.start().then((ok) => {
      if (cancelled) return;
      if (!ok && approveResolveRef.current === null) {
        setState({ kind: 'not-installed' });
      }
    });

    return () => {
      cancelled = true;
      approveResolveRef.current?.(false);
      tracker.stop();
    };
  }, [open]);

  // Dismiss on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const onApproveOrigin = async () => {
    if (state.kind !== 'needs-approve') return;
    const approved = await openApprovePopup({ url: state.approveUrl });
    const resolver = approveResolveRef.current;
    if (resolver) resolver(approved);
    if (!approved) setAuthError('Browser blocked the approve popup. Allow popups and retry.');
  };

  const onDeviceAction = (d: WdpDevice) => {
    if (d.proxyStatus !== 'PROXY_UNAUTHORIZED') {
      onConnect(d);
      return;
    }
    setAuthError(null);
    setAuthorizingSerial(d.serialNumber);
    // window.open must run synchronously inside the user gesture, so we
    // call openApprovePopup (which wraps the call in its Promise body)
    // without any preceding await.
    void openApprovePopup({ url: d.approveUrl }).then(async (approved) => {
      if (!approved) {
        setAuthorizingSerial(null);
        setAuthError(
          'Browser blocked the approve popup. Allow popups for this site and try again.',
        );
        return;
      }
      // 250ms matches Perfetto's reference client — gives WDP time to
      // push the PROXY_UNAUTHORIZED → ADB/DEVICE transition.
      await sleep(250);
      const latest = devicesRef.current.find((x) => x.serialNumber === d.serialNumber);
      setAuthorizingSerial(null);
      if (latest && wdpDeviceReady(latest)) {
        onConnect(latest);
        return;
      }
      setAuthError(
        `Device still ${latest ? wdpDeviceStatus(latest) : 'not visible'} after authorisation. Accept the prompt on the device, then click Connect again.`,
      );
    });
  };

  if (!open) return null;

  return (
    <>
      <div className="md-scrim" onClick={onClose} />
      <div
        className="md-dialog wdp-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Connect via Web Device Proxy"
      >
        <div className="md-dialog-head">
          <h2>Connect via Web Device Proxy</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icons.Close size={14} />
          </button>
        </div>
        <div className="md-dialog-body wdp-dialog-body">
          <p className="wdp-dialog-blurb">
            The Web Device Proxy coexists with a running <code>adb</code>, exposes emulators and
            Wi-Fi-attached devices, and works in any browser.{' '}
            <a className="link" href={DOCS_URL} target="_blank" rel="noreferrer">
              Learn more
            </a>
            .
          </p>

          {state.kind === 'idle' && (
            <div className="wdp-dialog-status">Looking for the daemon…</div>
          )}

          {state.kind === 'not-installed' && (
            <div className="wdp-dialog-empty" role="note">
              <div className="wdp-dialog-empty-title">Daemon not detected</div>
              <p>
                Install Android Web Device Proxy from the official Google page and re-open this
                dialog. The proxy must be running on <code>localhost:9167</code>.
              </p>
              <a
                className="btn primary wdp-dialog-install"
                href={WDP_DOWNLOAD_URL}
                target="_blank"
                rel="noreferrer"
              >
                Install
              </a>
            </div>
          )}

          {state.kind === 'needs-approve' && (
            <div className="wdp-dialog-approve">
              <p>
                The daemon is running but doesn't recognise this origin yet. Approve it once and
                subsequent connections will be silent.
              </p>
              <button
                className="btn primary"
                onClick={onApproveOrigin}
                disabled={!!busy}
              >
                Authorize WebLogcat in WDP
              </button>
              {authError && <div className="wdp-device-error" role="alert">{authError}</div>}
            </div>
          )}

          {state.kind === 'connected' && (
            <div className="wdp-dialog-list">
              {state.version && (
                <div className="wdp-dialog-version" title={state.version}>
                  proxy v{shortVersion(state.version)}
                </div>
              )}
              {state.devices.length === 0 && (
                <div className="wdp-dialog-empty-line">
                  No devices visible yet. Plug in a device or start an emulator.
                </div>
              )}
              {authError && <div className="wdp-device-error" role="alert">{authError}</div>}
              {state.devices.length > 0 && (
                <ul className="wdp-devices">
                  {state.devices.map((d) => {
                    const isAuthorizing = authorizingSerial === d.serialNumber;
                    const ready = wdpDeviceReady(d);
                    const canAuthorize = d.proxyStatus === 'PROXY_UNAUTHORIZED';
                    return (
                      <li key={d.serialNumber} className="wdp-device">
                        <div className="wdp-device-meta">
                          <div className="wdp-device-name" title={deviceLabel(d)}>
                            {deviceLabel(d)}
                          </div>
                          <div className="wdp-device-sub" title={d.serialNumber}>
                            {d.serialNumber} · {wdpDeviceStatus(d)}
                          </div>
                        </div>
                        <button
                          className="btn wdp-device-connect"
                          onClick={() => onDeviceAction(d)}
                          disabled={busy || isAuthorizing || (!ready && !canAuthorize)}
                        >
                          {isAuthorizing
                            ? 'Authorizing…'
                            : canAuthorize
                              ? 'Authorize'
                              : 'Connect'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function deviceLabel(d: WdpDevice): string {
  if (d.proxyStatus === 'ADB') {
    return d.adbProps?.['ro.product.model'] ?? d.adbProps?.['ro.product.name'] ?? d.serialNumber;
  }
  return d.serialNumber;
}

function shortVersion(v: string): string {
  // WDP version strings look like "androidbuild_web_device_proxy_linux_1.2";
  // strip the long prefix so the chip stays compact.
  const m = /(\d+(?:\.\d+)+)/.exec(v);
  return m ? m[1] : v;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
