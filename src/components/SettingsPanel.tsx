// Slide-in settings drawer (440px, scrim behind).
// Ported from design/source/settings.jsx.

import * as Icons from './Icons';
import type { Accent, Density, Theme, Tweaks } from '../types';

const ACCENTS: ReadonlyArray<{ k: Accent; label: string; hue: number }> = [
  { k: 'indigo', label: 'Indigo', hue: 268 },
  { k: 'teal', label: 'Teal', hue: 190 },
  { k: 'amber', label: 'Amber', hue: 60 },
  { k: 'rose', label: 'Rose', hue: 12 },
];

const DENSITIES: Density[] = ['compact', 'cozy', 'comfortable'];

export interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  tweaks: Tweaks;
  onChange: (patch: Partial<Tweaks>) => void;
}

export function SettingsPanel({ open, onClose, tweaks, onChange }: SettingsPanelProps) {
  if (!open) return null;
  return (
    <>
      <div className="settings-scrim" onClick={onClose} />
      <div className="settings" role="dialog" aria-label="Settings">
        <div className="settings-head">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icons.Close size={14} />
          </button>
        </div>

        <Section label="Appearance">
          <Row k="Theme">
            <div className="seg">
              <SegBtn
                active={tweaks.theme === 'light'}
                onClick={() => onChange({ theme: 'light' satisfies Theme })}
              >
                <Icons.Sun size={13} /> Light
              </SegBtn>
              <SegBtn
                active={tweaks.theme === 'dark'}
                onClick={() => onChange({ theme: 'dark' })}
              >
                <Icons.Moon size={13} /> Dark
              </SegBtn>
            </div>
          </Row>
          <Row k="Color scheme">
            <div className="accents">
              {ACCENTS.map((a) => (
                <button
                  key={a.k}
                  className={`accent-swatch ${tweaks.accent === a.k ? 'active' : ''}`}
                  onClick={() => onChange({ accent: a.k })}
                >
                  <span
                    className="sw"
                    style={{
                      background: `oklch(${tweaks.theme === 'dark' ? '0.74' : '0.50'} 0.16 ${a.hue})`,
                    }}
                  />
                  <span>{a.label}</span>
                </button>
              ))}
            </div>
          </Row>
        </Section>

        <Section label="Display">
          <Row k="Density">
            <div className="seg">
              {DENSITIES.map((d) => (
                <SegBtn
                  key={d}
                  active={tweaks.density === d}
                  onClick={() => onChange({ density: d })}
                >
                  {d}
                </SegBtn>
              ))}
            </div>
          </Row>
          <Row k="Heatmap gutter">
            <Toggle
              on={tweaks.showHeatmap}
              onClick={() => onChange({ showHeatmap: !tweaks.showHeatmap })}
            />
          </Row>
        </Section>

        <Section label="About">
          <div className="settings-about">
            WebLogcat — a web-based Android logcat viewer.
            <br />
            Built with WebUSB + ADB protocol.
            <br />
            Source on GitHub.
          </div>
        </Section>
      </div>
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="settings-section">
      <div className="settings-label">{label}</div>
      {children}
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="settings-row">
      <div className="settings-key">{k}</div>
      {children}
    </div>
  );
}

function SegBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button className={active ? 'active' : ''} onClick={onClick}>
      {children}
    </button>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button className={`toggle ${on ? 'on' : ''}`} onClick={onClick} aria-pressed={on}>
      <span className="toggle-dot" />
    </button>
  );
}
