// Dashboard — the connected app shell. Topbar (brand / device picker /
// theme / +Add / Reset) above a `<TileGrid/>`.
//
// Replaces the v1 single-purpose `<Toolbar/>` + `<FilterBar/>` global
// chrome. The brand / device / theme bits move out of Toolbar into the
// `DashTopbar` here; everything else (filter bar, level row, log area,
// search overlay) is now per-`<LogcatWidget/>`.

import { useCallback, useState } from 'react';
import * as Icons from './Icons';
import { TileGrid } from './TileGrid';
import { WidgetPalette } from './WidgetPalette';
import type { DeviceInfo, LayoutState, Theme, WidgetKind } from '../types';

export interface DashboardProps {
  device: DeviceInfo;
  devices: DeviceInfo[];
  usingFake: boolean;
  theme: Theme;
  onSetTheme: (t: Theme) => void;
  onSwitchDevice: (d: DeviceInfo) => void;
  onDisconnect: () => void;
  onPairNew: () => void;
}

export function Dashboard({
  device,
  devices,
  usingFake,
  theme,
  onSetTheme,
  onSwitchDevice,
  onDisconnect,
  onPairNew,
}: DashboardProps) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  // `resetSignal` and `addSignal` are bumped to push imperative actions
  // down into `<TileGrid/>` without lifting its layout state up. This is
  // simpler than threading callbacks through every drag/resize tick.
  const [resetSignal, setResetSignal] = useState(0);
  const [addSignal, setAddSignal] = useState<{ kind: WidgetKind; n: number } | null>(null);
  const [layoutSnapshot, setLayoutSnapshot] = useState<LayoutState>([]);

  const onAddPick = useCallback((kind: WidgetKind) => {
    setAddSignal((p) => ({ kind, n: (p?.n ?? 0) + 1 }));
    setPaletteOpen(false);
  }, []);

  return (
    <div className="dash">
      <DashTopbar
        device={device}
        devices={devices}
        usingFake={usingFake}
        theme={theme}
        onSetTheme={onSetTheme}
        onSwitchDevice={onSwitchDevice}
        onDisconnect={onDisconnect}
        onPairNew={onPairNew}
        onAddWidget={() => setPaletteOpen(true)}
        onResetLayout={() => setResetSignal((n) => n + 1)}
      />

      <TileGrid
        resetSignal={resetSignal}
        addSignal={addSignal}
        onLayoutChange={setLayoutSnapshot}
        onRequestAdd={() => setPaletteOpen(true)}
      />

      {paletteOpen && (
        <WidgetPalette
          layout={layoutSnapshot}
          onClose={() => setPaletteOpen(false)}
          onPick={onAddPick}
        />
      )}
    </div>
  );
}

// ---- Topbar ----------------------------------------------------------------

interface DashTopbarProps {
  device: DeviceInfo;
  devices: DeviceInfo[];
  usingFake: boolean;
  theme: Theme;
  onSetTheme: (t: Theme) => void;
  onSwitchDevice: (d: DeviceInfo) => void;
  onDisconnect: () => void;
  onPairNew: () => void;
  onAddWidget: () => void;
  onResetLayout: () => void;
}

function DashTopbar({
  device,
  devices,
  usingFake,
  theme,
  onSetTheme,
  onSwitchDevice,
  onDisconnect,
  onPairNew,
  onAddWidget,
  onResetLayout,
}: DashTopbarProps) {
  const [devOpen, setDevOpen] = useState(false);

  return (
    <div className="dash-top">
      <div className="dash-brand">
        <span className="dash-brand-glyph">
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path
              d="M 4 5 L 4 13 M 8 3 L 8 15 M 12 7 L 12 11 M 14 5 L 14 13"
              stroke="var(--accent)"
              strokeWidth={1.6}
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span className="dash-brand-name">WebLogcat</span>
        <span className="dash-brand-sub">Dashboard</span>
      </div>

      <div className="dash-device" onClick={() => setDevOpen((o) => !o)}>
        <span className="dash-device-status" data-fake={usingFake}>
          <span className="dash-device-dot" />
        </span>
        <Icons.Device size={13} />
        <div className="dash-device-info">
          <div className="dash-device-name">{device.model}</div>
          <div className="dash-device-meta">
            {device.serial} · Android {device.androidVersion}
          </div>
        </div>
        <Icons.Chevron size={11} />
        {devOpen && (
          <div className="dash-device-pop" onClick={(e) => e.stopPropagation()}>
            {devices.map((d) => (
              <button
                key={d.serial}
                className={`dash-device-row ${d.serial === device.serial ? 'current' : ''}`}
                onClick={() => {
                  onSwitchDevice(d);
                  setDevOpen(false);
                }}
              >
                <span className={`dash-device-row-dot ${d.fake ? 'fake' : ''}`} />
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ color: 'var(--fg-0)', fontSize: 'var(--t-sm)' }}>
                    {d.model}
                  </div>
                  <div
                    style={{
                      color: 'var(--fg-3)',
                      fontSize: 'var(--t-xs)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {d.serial}
                  </div>
                </div>
                {d.serial === device.serial && <Icons.Check size={12} />}
              </button>
            ))}
            <div className="dash-device-pop-foot">
              <button
                onClick={() => {
                  onPairNew();
                  setDevOpen(false);
                }}
              >
                <Icons.Plus size={11} /> Pair new device…
              </button>
              <button
                onClick={() => {
                  onDisconnect();
                  setDevOpen(false);
                }}
              >
                <Icons.Close size={11} /> Disconnect
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ flex: 1 }} />

      <div className="dash-actions">
        <button className="dash-add" onClick={onAddWidget}>
          <Icons.Plus size={13} /> Add widget
        </button>
        <button
          className="icon-btn tt"
          data-tt="Reset layout"
          onClick={onResetLayout}
          aria-label="Reset layout"
        >
          <Icons.Refresh size={13} />
        </button>
        <div className="dash-divider" />
        <button
          className="icon-btn tt"
          data-tt={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
          onClick={() => onSetTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Icons.Sun size={13} /> : <Icons.Moon size={13} />}
        </button>
      </div>
    </div>
  );
}
