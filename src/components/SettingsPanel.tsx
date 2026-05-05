// Slide-in settings drawer (440px wide, scrim behind).
//
// TODO(sonnet): port from design/source/settings.jsx. Sections:
//   - Appearance: theme segmented, color scheme grid (indigo/teal/amber/rose)
//   - Display: density segmented, heatmap toggle, scrubber toggle
//   - About: WebUSB + ADB blurb

import type { Tweaks } from '../types';

export interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  tweaks: Tweaks;
  onChange: (patch: Partial<Tweaks>) => void;
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  if (!open) return null;
  return (
    <>
      <div className="overlay-catch" onClick={onClose} />
      <div className="settings-panel" role="dialog" aria-label="Settings">
        <div className="dd-section">SETTINGS</div>
        <p style={{ padding: '12px 16px', color: 'var(--fg-2)' }}>
          TODO: port from <code>design/source/settings.jsx</code>.
        </p>
      </div>
    </>
  );
}
