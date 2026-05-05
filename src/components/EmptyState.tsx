// Pre-connection screen.
//
// TODO(sonnet): port the full design from design/source/empty-state.jsx —
// animated USB cable illustration (stroked SVG with dashed animation),
// grid background mask, radial fade, and copy formatting.
// This stub is functional but visually plain.

import { UsbIcon } from './Icons';

export interface EmptyStateProps {
  onConnect: () => void;
  onUseSimulated: () => void;
}

export function EmptyState({ onConnect, onUseSimulated }: EmptyStateProps) {
  return (
    <div className="empty">
      <div className="empty-card">
        <div className="empty-illustration">
          <UsbIcon width={48} height={48} />
        </div>
        <div className="empty-eyebrow">WEBLOGCAT</div>
        <h1 className="empty-title">No device connected</h1>
        <p className="empty-sub">
          Plug an Android device via USB and accept the debugging prompt. We'll stream logcat live,
          right here.
        </p>
        <div className="empty-actions">
          <button className="btn primary" onClick={onConnect}>
            <UsbIcon /> Connect a device
          </button>
          <div className="empty-or">
            or try the app with{' '}
            <button className="link" onClick={onUseSimulated}>
              simulated data
            </button>
          </div>
        </div>
        <p className="empty-hint">
          Requires a Chromium-based browser over HTTPS. WebUSB is unavailable in Firefox / Safari.
        </p>
      </div>
    </div>
  );
}
