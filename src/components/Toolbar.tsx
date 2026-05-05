// Top toolbar (52px tall) — brand, device picker, theme toggle, export, settings.
//
// TODO(sonnet): port from design/source/toolbar.jsx. The visual scaffold
// (.toolbar / .tb-*) classes already exist in styles/app.css.

import type { DeviceInfo } from '../types';

export interface ToolbarProps {
  device: DeviceInfo | null;
  onOpenSettings: () => void;
  onExport: () => void;
  onToggleTheme: () => void;
}

export function Toolbar({ device, onOpenSettings, onExport, onToggleTheme }: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="tb-brand">
        <span className="tb-logo">
          <span className="tb-logo-square s1" />
          <span className="tb-logo-square s2" />
          <span className="tb-logo-square s3" />
        </span>
        <span className="tb-name">weblogcat</span>
      </div>
      <span className="divider" />
      <div className="tb-device">
        {device ? (
          <span>
            {device.model} <span className="dd-device-meta">{device.serial}</span>
          </span>
        ) : (
          <span className="dd-device-meta">no device</span>
        )}
      </div>
      <div className="tb-spacer" />
      <button className="icon-btn" onClick={onToggleTheme} aria-label="Toggle theme">
        ☼
      </button>
      <button className="icon-btn" onClick={onExport} aria-label="Export logs">
        ↧
      </button>
      <button className="icon-btn" onClick={onOpenSettings} aria-label="Settings">
        ⚙
      </button>
    </div>
  );
}
