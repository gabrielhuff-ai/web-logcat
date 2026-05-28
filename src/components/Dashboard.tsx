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
import { QuickAddMenu } from './QuickAddMenu';
import { GlobalSettingsModal } from './GlobalSettingsModal';
import { DashboardShareModal } from './DashboardShareModal';
import { PendingImportModal } from './PendingImportModal';
import {
  applySnapshot,
  captureSnapshot,
  hasScripts,
  onPendingImport,
  snapshotsEqual,
  takePendingImport,
} from '../lib/dashboardShare';
import type { DashboardSnapshot } from '../lib/dashboardShare';
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
}

export function Dashboard({
  device,
  devices,
  usingFake,
  tweaks,
  setTweaks,
  onSwitchDevice,
  onDisconnect,
}: DashboardProps) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [globalSettingsOpen, setGlobalSettingsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // A pending import waits here when it carries scripting panels — the user
  // confirms (or discards) via <PendingImportModal/>. Non-script imports
  // bypass this and apply immediately.
  const [pendingShared, setPendingShared] = useState<DashboardSnapshot | null>(null);
  // Bumped to remount <TileGrid/> so it re-reads the layout + per-tile settings
  // after an import — applying a shared dashboard live, without a reload (which
  // would drop the in-memory device connection and bounce to the connect screen).
  const [gridEpoch, setGridEpoch] = useState(0);

  const finishImport = useCallback((snap: DashboardSnapshot) => {
    applySnapshot(snap);
    setGridEpoch((e) => e + 1);
  }, []);

  // Apply a dashboard shared via `#share=…` link. The device is already
  // connected by the time the dashboard is mounted, so we apply in place.
  // Script-bearing snapshots are gated behind the trust modal; the rest
  // apply silently. Runs on mount (boot-stashed payload) and whenever a
  // same-tab hash change stashes a new one.
  const applyPending = useCallback(() => {
    const pending = takePendingImport();
    if (!pending) return;
    // Opening your own share link is a no-op — skip the prompt + the
    // re-apply entirely when the incoming snapshot matches the live one.
    if (snapshotsEqual(pending, captureSnapshot())) return;
    if (hasScripts(pending)) setPendingShared(pending);
    else finishImport(pending);
  }, [finishImport]);
  useEffect(() => {
    applyPending();
  }, [applyPending]);
  useEffect(() => onPendingImport(applyPending), [applyPending]);
  // `clearSignal` / `addSignal` / `undoSignal` / `redoSignal` /
  // `removeFocusedSignal` / `focusDirSignal` are bumped to push
  // imperative actions down into `<TileGrid/>` without lifting its
  // layout state up. Simpler than threading callbacks through every
  // drag/resize tick.
  const [clearSignal, setClearSignal] = useState(0);
  const [undoSignal, setUndoSignal] = useState(0);
  const [redoSignal, setRedoSignal] = useState(0);
  const [removeFocusedSignal, setRemoveFocusedSignal] = useState(0);
  const [focusDirSignal, setFocusDirSignal] = useState<{
    dir: 'left' | 'right' | 'up' | 'down';
    n: number;
  } | null>(null);
  const [addSignal, setAddSignal] = useState<{ kind: WidgetKind; n: number } | null>(null);
  const [layoutSnapshot, setLayoutSnapshot] = useState<LayoutState>({
    tiles: {},
    tree: null,
    focusId: null,
  });

  const onAddPick = useCallback((kind: WidgetKind) => {
    setAddSignal((p) => ({ kind, n: (p?.n ?? 0) + 1 }));
    setPaletteOpen(false);
    setQuickAddOpen(false);
  }, []);

  // Global keyboard shortcuts on the dashboard:
  //   - Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z — undo / redo layout edits.
  //   - Cmd/Ctrl+N                    — open the quick-add menu.
  //   - Arrow keys                    — move focus to the spatially
  //                                     adjacent tile (only when the
  //                                     active element isn't a text
  //                                     input — otherwise arrows
  //                                     still navigate inside Logcat,
  //                                     Shell input, etc.).
  //   - Backspace / Delete            — remove the focused tile.
  // The text-input guard is shared across all of these so typing
  // inside a widget never thrashes the layout.
  useEffect(() => {
    const inEditable = (t: EventTarget | null): boolean =>
      t instanceof HTMLInputElement ||
      t instanceof HTMLTextAreaElement ||
      (t instanceof HTMLElement && t.isContentEditable);

    const onKey = (e: KeyboardEvent) => {
      // Don't fire any shortcut while the user is typing somewhere.
      if (inEditable(e.target)) return;

      const lk = e.key.toLowerCase();

      // Undo / redo.
      if ((e.metaKey || e.ctrlKey) && lk === 'z') {
        e.preventDefault();
        if (e.shiftKey) setRedoSignal((n) => n + 1);
        else setUndoSignal((n) => n + 1);
        return;
      }

      // Quick-add menu. `Cmd/Ctrl+E` — `Cmd+N` was the original pick
      // but on macOS it's a system-level "new window" shortcut the
      // browser can't intercept (preventDefault is too late). `E` is
      // unbound across Chrome / Safari / Firefox on every platform
      // and is in muscle memory from other dashboards (Linear, Notion)
      // for "Edit" / quick-action menus.
      if ((e.metaKey || e.ctrlKey) && lk === 'e' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setQuickAddOpen(true);
        return;
      }

      // Beyond this point we want unmodified keys only — Cmd+Arrow on
      // macOS jumps the cursor; Cmd+Delete trashes a file in Finder.
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const dir = (
          {
            ArrowLeft: 'left',
            ArrowRight: 'right',
            ArrowUp: 'up',
            ArrowDown: 'down',
          } as const
        )[e.key];
        e.preventDefault();
        setFocusDirSignal((p) => ({ dir, n: (p?.n ?? 0) + 1 }));
        return;
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
        // Only react when there's actually a focused tile (otherwise
        // a stray Backspace shouldn't tear something down silently).
        if (!layoutSnapshot.focusId) return;
        e.preventDefault();
        setRemoveFocusedSignal((n) => n + 1);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [layoutSnapshot.focusId]);

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
        onAddWidget={() => setPaletteOpen(true)}
        onClearLayout={() => setClearSignal((n) => n + 1)}
        onOpenGlobalSettings={() => setGlobalSettingsOpen(true)}
        onOpenShare={() => setShareOpen(true)}
      />

      <TileGrid
        key={gridEpoch}
        clearSignal={clearSignal}
        undoSignal={undoSignal}
        redoSignal={redoSignal}
        addSignal={addSignal}
        removeFocusedSignal={removeFocusedSignal}
        focusDirSignal={focusDirSignal}
        onLayoutChange={setLayoutSnapshot}
        onRequestAdd={() => setQuickAddOpen(true)}
      />

      {quickAddOpen && (
        <QuickAddMenu
          layout={layoutSnapshot}
          onPick={onAddPick}
          onMore={() => {
            setQuickAddOpen(false);
            setPaletteOpen(true);
          }}
          onClose={() => setQuickAddOpen(false)}
        />
      )}

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

      {shareOpen && (
        <DashboardShareModal
          onClose={() => setShareOpen(false)}
          onImported={() => {
            setGridEpoch((e) => e + 1);
            setShareOpen(false);
          }}
        />
      )}

      {pendingShared && (
        <PendingImportModal
          snapshot={pendingShared}
          onConfirm={() => {
            finishImport(pendingShared);
            setPendingShared(null);
          }}
          onCancel={() => setPendingShared(null)}
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
  onAddWidget: () => void;
  onClearLayout: () => void;
  onOpenGlobalSettings: () => void;
  onOpenShare: () => void;
}

function DashTopbar({
  device,
  devices,
  usingFake,
  tweaks,
  setTweaks,
  onSwitchDevice,
  onDisconnect,
  onAddWidget,
  onClearLayout,
  onOpenGlobalSettings,
  onOpenShare,
}: DashTopbarProps) {
  const [devOpen, setDevOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const devRef = useRef<HTMLDivElement>(null);

  // Click-outside + Escape dismiss for the device picker. Was missing
  // entirely — the previous behaviour required clicking the chip again
  // to close, which was disorienting.
  useEffect(() => {
    if (!devOpen) return;
    const onDown = (e: MouseEvent) => {
      const root = devRef.current;
      if (!root) return;
      if (!root.contains(e.target as Node)) setDevOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDevOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [devOpen]);

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
        <span className="dash-brand-beta" aria-label="Beta release">beta</span>
      </button>

      <div style={{ flex: 1 }} />

      <div className="dash-actions">
        <div className="dash-device" ref={devRef} onClick={() => setDevOpen((o) => !o)}>
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
        <button
          className="icon-btn tt"
          data-tt="Share dashboard"
          onClick={onOpenShare}
          aria-label="Import or export dashboard"
        >
          <Icons.Share size={13} />
        </button>
        <div className="dash-divider" />
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
        <a
          className="icon-btn tt"
          data-tt="Open docs"
          // Vite injects the deploy base path here, so the link
          // resolves correctly under both `/web-logcat/` (production)
          // and `/web-logcat/staging/` (staging) without any baked-in
          // owner string. `target="_blank"` opens the docs site in a
          // new tab so the user's session in this tab keeps streaming.
          href={`${import.meta.env.BASE_URL}docs/`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open documentation"
        >
          <Icons.Book size={13} />
        </a>
        <div className="dash-divider" />
        <AppearanceButton
          tweaks={tweaks}
          setTweaks={setTweaks}
          open={appearanceOpen}
          setOpen={setAppearanceOpen}
        />
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
