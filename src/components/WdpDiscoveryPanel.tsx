// Discovery + connect surface for the Web Device Proxy transport.
//
// Renders one of four states based on the live `WdpTracker`:
//
//   - 'idle'           — probing the daemon on first mount.
//   - 'not-installed'  — the localhost socket isn't there. Shows the
//                        install hint + a one-tap dismiss (sticky).
//   - 'needs-approve'  — daemon is up but our origin isn't allowlisted.
//                        Shows a button that opens the approve popup.
//   - 'connected'      — daemon is up and reachable. Lists devices with
//                        per-row "Connect" actions. The list updates
//                        live as devices come and go.
//
// Dismissal of the 'not-installed' state persists in localStorage so we
// don't pester users who already know the proxy isn't right for them.

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

const DOCS_URL = 'docs/features/connecting.html#device-proxy-optional';
const DISMISS_KEY = 'weblogcat:wdp-not-installed:dismissed:v1';

type PanelState =
  | { kind: 'idle' }
  | { kind: 'not-installed' }
  | { kind: 'needs-approve'; approveUrl: string }
  | { kind: 'connected'; devices: WdpDevice[]; version: string };

export interface WdpDiscoveryPanelProps {
  /** Called when the user picks a WDP device. The parent owns the actual `connectViaWdp` call. */
  onConnect: (device: WdpDevice) => void;
  /** Disable the connect actions (e.g. while another connect is in flight). */
  busy?: boolean;
}

export function WdpDiscoveryPanel({ onConnect, busy }: WdpDiscoveryPanelProps) {
  const [state, setState] = useState<PanelState>({ kind: 'idle' });
  const [dismissed, setDismissed] = useState<boolean>(() => readDismissed());
  const [authorizingSerial, setAuthorizingSerial] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const trackerRef = useRef<WdpTracker | null>(null);
  // Latest device snapshot, mirrored from `state.devices` so click handlers
  // that resume after an awaited popup read the *current* device state
  // (not the stale closure value captured at click time). WDP transitions
  // a device from PROXY_UNAUTHORIZED to ADB/DEVICE asynchronously via the
  // long-lived track-devices socket — that transition is the signal we
  // wait for after the user dismisses the approve popup.
  const devicesRef = useRef<WdpDevice[]>([]);
  // Approve flow runs inside a user-gesture click handler, so we need a
  // synchronous trigger. The resolver is set when the panel renders the
  // 'needs-approve' state; clicking the button calls it.
  const approveResolveRef = useRef<((approved: boolean) => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    let snapshotVersion: string = '';

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
        // Daemon went away mid-session; revert to not-installed state so
        // the user can re-probe by reloading or relaunching WDP.
        setState({ kind: 'not-installed' });
      },
    });

    trackerRef.current = tracker;
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
      trackerRef.current = null;
    };
  }, []);

  const onApproveClick = async () => {
    if (state.kind !== 'needs-approve') return;
    const approved = await openApprovePopup({ url: state.approveUrl });
    const resolver = approveResolveRef.current;
    if (resolver) {
      resolver(approved);
    }
    if (!approved) {
      setState({ kind: 'not-installed' });
    }
  };

  /**
   * Click handler for a device row. Ready devices forward to `onConnect`
   * directly; `PROXY_UNAUTHORIZED` devices open WDP's per-device approve
   * popup synchronously (browsers require `window.open` to be inside the
   * user gesture, so we cannot defer this through any awaits before the
   * popup call). After the popup closes we give WDP a beat to push the
   * updated snapshot, then forward the *latest* device entry — looked up
   * by serial from `devicesRef` — to `onConnect`.
   */
  const onDeviceAction = (d: WdpDevice) => {
    if (d.proxyStatus !== 'PROXY_UNAUTHORIZED') {
      onConnect(d);
      return;
    }
    setAuthError(null);
    setAuthorizingSerial(d.serialNumber);
    // openApprovePopup calls window.open synchronously inside its Promise
    // constructor, so the gesture is preserved.
    void openApprovePopup({ url: d.approveUrl }).then(async (approved) => {
      if (!approved) {
        setAuthorizingSerial(null);
        setAuthError(
          'Browser blocked the approve popup. Allow popups for this site and try again.',
        );
        return;
      }
      // WDP pushes the post-approval snapshot on /track-devices-json
      // shortly after the popup closes. 250ms matches Perfetto's
      // reference client; if the state hasn't transitioned by then, give
      // the user a clear next step instead of looping.
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

  const onDismiss = () => {
    writeDismissed();
    setDismissed(true);
  };

  if (state.kind === 'idle') return null;

  if (state.kind === 'not-installed' && dismissed) return null;

  return (
    <div className="wdp-panel" role="region" aria-label="Device Proxy">
      {state.kind === 'not-installed' && (
        <NotInstalled onDismiss={onDismiss} />
      )}
      {state.kind === 'needs-approve' && (
        <NeedsApprove onApprove={onApproveClick} busy={!!busy} />
      )}
      {state.kind === 'connected' && (
        <Connected
          devices={state.devices}
          version={state.version}
          onDeviceAction={onDeviceAction}
          authorizingSerial={authorizingSerial}
          authError={authError}
          busy={!!busy}
        />
      )}
    </div>
  );
}

function NotInstalled({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="wdp-row wdp-row-tip" role="note">
      <div className="wdp-icon" aria-hidden="true">
        <Icons.Sparkle size={14} />
      </div>
      <div className="wdp-body">
        <div className="wdp-title">Multiple devices, Wi-Fi ADB, or emulators?</div>
        <div className="wdp-text">
          Install{' '}
          <a className="link" href={WDP_DOWNLOAD_URL} target="_blank" rel="noreferrer">
            Android Web Device Proxy
          </a>{' '}
          to coexist with a running <code>adb</code> and reach emulators.{' '}
          <a className="link" href={DOCS_URL}>
            Learn more
          </a>
          .
        </div>
      </div>
      <button
        className="wdp-close"
        onClick={onDismiss}
        aria-label="Dismiss tip"
        title="Don't show again"
      >
        <Icons.Close size={12} />
      </button>
    </div>
  );
}

function NeedsApprove({ onApprove, busy }: { onApprove: () => void; busy: boolean }) {
  return (
    <div className="wdp-row wdp-row-action">
      <div className="wdp-icon" aria-hidden="true">
        <Icons.Lock size={14} />
      </div>
      <div className="wdp-body">
        <div className="wdp-title">Authorize WebLogcat in Web Device Proxy</div>
        <div className="wdp-text">
          WDP is running on your machine but doesn't recognise this origin yet. Approve to use it
          here.
        </div>
      </div>
      <button className="btn primary wdp-action" onClick={onApprove} disabled={busy}>
        Authorize
      </button>
    </div>
  );
}

function Connected({
  devices,
  version,
  onDeviceAction,
  authorizingSerial,
  authError,
  busy,
}: {
  devices: WdpDevice[];
  version: string;
  onDeviceAction: (d: WdpDevice) => void;
  authorizingSerial: string | null;
  authError: string | null;
  busy: boolean;
}) {
  return (
    <div className="wdp-connected">
      <div className="wdp-header">
        <div className="wdp-icon" aria-hidden="true">
          <Icons.Stack size={14} />
        </div>
        <div className="wdp-body">
          <div className="wdp-title">Web Device Proxy is running</div>
          <div className="wdp-text">
            {devices.length === 0
              ? 'No devices visible yet. Plug a device in or start an emulator.'
              : 'Pick a device to connect via the proxy (coexists with adb).'}
          </div>
        </div>
        {version && <div className="wdp-version" title={version}>v{shortVersion(version)}</div>}
      </div>
      {authError && (
        <div className="wdp-device-error" role="alert">
          {authError}
        </div>
      )}
      {devices.length > 0 && (
        <ul className="wdp-devices">
          {devices.map((d) => {
            const isAuthorizing = authorizingSerial === d.serialNumber;
            const ready = wdpDeviceReady(d);
            const canAuthorize = d.proxyStatus === 'PROXY_UNAUTHORIZED';
            return (
            <li key={d.serialNumber} className="wdp-device">
              <div className="wdp-device-meta">
                <div className="wdp-device-name">{deviceLabel(d)}</div>
                <div className="wdp-device-sub">
                  {d.serialNumber} · {wdpDeviceStatus(d)}
                </div>
              </div>
              <button
                className="btn wdp-device-connect"
                onClick={() => onDeviceAction(d)}
                disabled={busy || isAuthorizing || (!ready && !canAuthorize)}
              >
                {isAuthorizing ? 'Authorizing…' : canAuthorize ? 'Authorize' : 'Connect'}
              </button>
            </li>
          );
          })}
        </ul>
      )}
    </div>
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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

function readDismissed(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* quota / SecurityError — tip reappears next reload */
  }
}
