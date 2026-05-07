// Dashboard — the connected app shell. Topbar (brand / device picker /
// add / clear / appearance / global settings / source-link) above a
// `<TileGrid/>`.
//
// "Clear layout" empties the dashboard back to the empty-state CTA so
// users explicitly add widgets afterwards. Cmd/Ctrl+Z and Cmd/Ctrl+
// Shift+Z undo / redo additions, removals, and clears (driven by the
// history stack inside `<TileGrid/>` — we just bump a signal here).

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import * as Icons from './Icons';
import { TileGrid } from './TileGrid';
import { WidgetPalette } from './WidgetPalette';
import { GlobalSettingsModal } from './GlobalSettingsModal';
import { APP_VERSION } from '../version';
import type { Accent, DeviceInfo, LayoutState, Tweaks, WidgetKind } from '../types';

export interface DashboardProps {
  device: DeviceInfo;
  devices: DeviceInfo[];
  usingFake: boolean;
  tweaks: Tweaks;
  setTweaks: (patch: Partial<Tweaks>) => void;
  onSwitchDevice: (d: DeviceInfo) => void;
  onDisconnect: () => void;
  onPairNew: () => void;
}

export function Dashboard({
  device,
  devices,
  usingFake,
  tweaks,
  setTweaks,
  onSwitchDevice,
  onDisconnect,
  onPairNew,
}: DashboardProps) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [globalSettingsOpen, setGlobalSettingsOpen] = useState(false);
  // `clearSignal` / `addSignal` / `undoSignal` / `redoSignal` are bumped
  // to push imperative actions down into `<TileGrid/>` without lifting
  // its layout state up. Simpler than threading callbacks through every
  // drag/resize tick.
  const [clearSignal, setClearSignal] = useState(0);
  const [undoSignal, setUndoSignal] = useState(0);
  const [redoSignal, setRedoSignal] = useState(0);
  const [addSignal, setAddSignal] = useState<{ kind: WidgetKind; n: number } | null>(null);
  const [layoutSnapshot, setLayoutSnapshot] = useState<LayoutState>({
    tiles: {},
    tree: null,
    focusId: null,
  });

  const onAddPick = useCallback((kind: WidgetKind) => {
    setAddSignal((p) => ({ kind, n: (p?.n ?? 0) + 1 }));
    setPaletteOpen(false);
  }, []);

  // Cmd/Ctrl+Z (undo) and Cmd/Ctrl+Shift+Z (redo) on the dashboard.
  // We swallow the keystroke when the focus is inside a text input so
  // the user can still undo their typing without thrashing the layout.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() !== 'z') return;
      const t = e.target as HTMLElement | null;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      if (e.shiftKey) setRedoSignal((n) => n + 1);
      else setUndoSignal((n) => n + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="dash">
      <DashTopbar
        device={device}
        devices={devices}
        usingFake={usingFake}
        tweaks={tweaks}
        setTweaks={setTweaks}
        onSwitchDevice={onSwitchDevice}
        onDisconnect={onDisconnect}
        onPairNew={onPairNew}
        onAddWidget={() => setPaletteOpen(true)}
        onClearLayout={() => setClearSignal((n) => n + 1)}
        onOpenGlobalSettings={() => setGlobalSettingsOpen(true)}
      />

      <TileGrid
        clearSignal={clearSignal}
        undoSignal={undoSignal}
        redoSignal={redoSignal}
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

      {globalSettingsOpen && (
        <GlobalSettingsModal
          tweaks={tweaks}
          setTweaks={setTweaks}
          onClose={() => setGlobalSettingsOpen(false)}
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
  tweaks: Tweaks;
  setTweaks: (patch: Partial<Tweaks>) => void;
  onSwitchDevice: (d: DeviceInfo) => void;
  onDisconnect: () => void;
  onPairNew: () => void;
  onAddWidget: () => void;
  onClearLayout: () => void;
  onOpenGlobalSettings: () => void;
}

function DashTopbar({
  device,
  devices,
  usingFake,
  tweaks,
  setTweaks,
  onSwitchDevice,
  onDisconnect,
  onPairNew,
  onAddWidget,
  onClearLayout,
  onOpenGlobalSettings,
}: DashTopbarProps) {
  const [devOpen, setDevOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  return (
    <div className="dash-top">
      <button
        type="button"
        className="dash-brand"
        onClick={onDisconnect}
        title={`WebLogcat v${APP_VERSION} · click to disconnect`}
      >
        <span className="dash-brand-glyph">
          <span className="dash-brand-square s1" />
          <span className="dash-brand-square s2" />
          <span className="dash-brand-square s3" />
        </span>
        <span className="dash-brand-name">WebLogcat</span>
        <span className="dash-brand-beta" aria-label="Alpha release">alpha</span>
      </button>

      <div style={{ flex: 1 }} />

      <div className="dash-actions">
        <div className="dash-device" onClick={() => setDevOpen((o) => !o)}>
          <span className="dash-device-status" data-fake={usingFake}>
            <span className="dash-device-dot" />
          </span>
          <Icons.Device size={13} />
          <div className="dash-device-info">
            <div className="dash-device-name">{device.model}</div>
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

        <div className="dash-divider" />

        <button className="dash-add" onClick={onAddWidget}>
          <Icons.Plus size={13} /> Add widget
        </button>
        <button
          className="icon-btn tt"
          data-tt="Clear layout"
          onClick={onClearLayout}
          aria-label="Clear layout"
        >
          <Icons.Clear size={13} />
        </button>
        <div className="dash-divider" />
        <AppearanceButton
          tweaks={tweaks}
          setTweaks={setTweaks}
          open={appearanceOpen}
          setOpen={setAppearanceOpen}
        />
        <a
          className="icon-btn tt"
          data-tt="View source on GitHub"
          href="https://github.com/gabrielhuff/web-logcat"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View source on GitHub"
        >
          <Icons.Github size={14} />
        </a>
        <button
          className="icon-btn tt"
          data-tt="Global settings"
          onClick={onOpenGlobalSettings}
          aria-label="Global settings"
        >
          <Icons.Settings size={13} />
        </button>
      </div>
    </div>
  );
}

// ---- Appearance popover ----------------------------------------------------

interface AppearanceButtonProps {
  tweaks: Tweaks;
  setTweaks: (patch: Partial<Tweaks>) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
}

const ACCENTS: ReadonlyArray<{ k: Accent; label: string; hue: number }> = [
  { k: 'indigo', label: 'Indigo', hue: 268 },
  { k: 'teal', label: 'Teal', hue: 190 },
  { k: 'amber', label: 'Amber', hue: 60 },
  { k: 'rose', label: 'Rose', hue: 12 },
];

function AppearanceButton({ tweaks, setTweaks, open, setOpen }: AppearanceButtonProps) {
  const wrapRef = useRef<HTMLDivElement>(null);

  // Click-outside + Escape close. Modeled on the device-picker popover.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const root = wrapRef.current;
      if (!root) return;
      if (!root.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);

  const { theme, accent, compactMode } = tweaks;
  return (
    <div className="dash-appearance" ref={wrapRef}>
      <button
        className="icon-btn tt"
        data-tt="Appearance"
        aria-label="Appearance"
        onClick={() => setOpen(!open)}
      >
        <AppearanceIcon size={13} />
      </button>
      {open && (
        <div className="dash-device-pop dash-appearance-pop">
          <div className="dash-appearance-section">
            <div className="dash-appearance-label">Theme</div>
            <div className="seg">
              <button
                className={theme === 'light' ? 'active' : ''}
                onClick={() => setTweaks({ theme: 'light' })}
              >
                <Icons.Sun size={13} /> Light
              </button>
              <button
                className={theme === 'dark' ? 'active' : ''}
                onClick={() => setTweaks({ theme: 'dark' })}
              >
                <Icons.Moon size={13} /> Dark
              </button>
            </div>
          </div>
          <div className="dash-appearance-section">
            <div className="dash-appearance-label">Color scheme</div>
            <div className="accents">
              {ACCENTS.map((a) => {
                const swatchStyle: CSSProperties = {
                  background: `oklch(${theme === 'dark' ? '0.74' : '0.50'} 0.16 ${a.hue})`,
                };
                return (
                  <button
                    key={a.k}
                    className={`accent-swatch ${accent === a.k ? 'active' : ''}`}
                    onClick={() => setTweaks({ accent: a.k })}
                    aria-label={`Accent: ${a.label}`}
                    aria-pressed={accent === a.k}
                  >
                    <span className="sw" style={swatchStyle} />
                    <span>{a.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="dash-appearance-section">
            <div className="dash-appearance-label">Layout</div>
            <button
              type="button"
              className={`dash-compact-toggle ${compactMode ? 'active' : ''}`}
              role="switch"
              aria-checked={compactMode}
              onClick={() => setTweaks({ compactMode: !compactMode })}
            >
              <span className="dash-compact-track">
                <span className="dash-compact-thumb" />
              </span>
              <span className="dash-compact-text">
                <span className="dash-compact-title">Compact mode</span>
                <span className="dash-compact-desc">
                  Drop the gap and rounded corners so widgets cover every pixel.
                </span>
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Half-filled circle — the macOS-style "Appearance" glyph. Theme +
 * accent both live behind this button, and a circle split between
 * outline and fill is the most universally recognised marker for
 * "light/dark + colour" preferences. Defined inline here rather than
 * in `Icons.tsx` so this single-use SVG doesn't pollute the shared
 * icon set.
 */
function AppearanceIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M12 3 a9 9 0 0 1 0 18 Z" fill="currentColor" />
    </svg>
  );
}
