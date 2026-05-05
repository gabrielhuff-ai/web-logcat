// Top toolbar: brand + device picker + theme toggle + export + settings.
// Ported from design/source/toolbar.jsx.

import { useState } from 'react';
import * as Icons from './Icons';
import type { DeviceInfo, Theme } from '../types';

export interface ToolbarProps {
  device: DeviceInfo;
  devices: DeviceInfo[];
  onSwitchDevice: (d: DeviceInfo) => void;
  onDisconnect: () => void;
  onPairNew: () => void;
  onExport: () => void;
  onOpenSettings: () => void;
  theme: Theme;
  onSetTheme: (t: Theme) => void;
}

export function Toolbar({
  device,
  devices,
  onSwitchDevice,
  onDisconnect,
  onPairNew,
  onExport,
  onOpenSettings,
  theme,
  onSetTheme,
}: ToolbarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="toolbar">
      <div className="tb-brand">
        <div className="tb-logo">
          <span className="tb-logo-square s1" />
          <span className="tb-logo-square s2" />
          <span className="tb-logo-square s3" />
        </div>
        <span className="tb-name">weblogcat</span>
      </div>

      <div className="divider" />

      <DevicePicker
        device={device}
        devices={devices}
        open={pickerOpen}
        setOpen={setPickerOpen}
        onSwitch={onSwitchDevice}
        onDisconnect={onDisconnect}
        onPairNew={onPairNew}
      />

      <div className="tb-spacer" />

      <button
        className="icon-btn tt"
        data-tt={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        onClick={() => onSetTheme(theme === 'dark' ? 'light' : 'dark')}
      >
        {theme === 'dark' ? <Icons.Sun size={15} /> : <Icons.Moon size={15} />}
      </button>
      <button className="icon-btn tt" data-tt="Save / export logs" onClick={onExport}>
        <Icons.Save />
      </button>
      <button className="icon-btn tt" data-tt="Settings" onClick={onOpenSettings}>
        <Icons.Settings />
      </button>
    </div>
  );
}

interface DevicePickerProps {
  device: DeviceInfo;
  devices: DeviceInfo[];
  open: boolean;
  setOpen: (v: boolean) => void;
  onSwitch: (d: DeviceInfo) => void;
  onDisconnect: () => void;
  onPairNew: () => void;
}

function deviceStatusClass(d: DeviceInfo): string {
  if (d.fake) return 'fake';
  return 'online';
}

function DevicePicker({
  device,
  devices,
  open,
  setOpen,
  onSwitch,
  onDisconnect,
  onPairNew,
}: DevicePickerProps) {
  return (
    <div className="dp">
      <button className="dp-btn" onClick={() => setOpen(!open)}>
        <span className={`dp-status ${deviceStatusClass(device)}`} />
        <span className="dp-info">
          <span className="dp-name">{device.model}</span>
          <span className="dp-meta">
            {device.serial} · Android {device.androidVersion}
          </span>
        </span>
        <Icons.Chevron size={13} />
      </button>
      {open && (
        <>
          <div className="overlay-catch" onClick={() => setOpen(false)} />
          <div className="dropdown">
            <div className="dd-section">Connected</div>
            {devices.map((d) => (
              <button
                key={d.serial}
                className={`dd-item ${d.serial === device.serial ? 'current' : ''}`}
                onClick={() => {
                  onSwitch(d);
                  setOpen(false);
                }}
              >
                <span className={`dp-status ${deviceStatusClass(d)}`} />
                <div className="dd-device">
                  <div>{d.model}</div>
                  <div className="dd-device-meta">
                    {d.serial} · Android {d.androidVersion}
                  </div>
                </div>
                {d.serial === device.serial && <Icons.Check size={13} />}
              </button>
            ))}
            <div className="dd-sep" />
            <button
              className="dd-item"
              onClick={() => {
                onPairNew();
                setOpen(false);
              }}
            >
              <Icons.Plus size={13} /> Pair new device…
            </button>
            <button
              className="dd-item"
              onClick={() => {
                onDisconnect();
                setOpen(false);
              }}
            >
              <Icons.Close size={13} /> Disconnect all
            </button>
          </div>
        </>
      )}
    </div>
  );
}
