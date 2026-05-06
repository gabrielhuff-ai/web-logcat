// Mirror settings modal body. Font size only — affects overlay text
// (REC pill, simulated-mode notices); the video itself isn't typographic.

import { useTileSettings } from '../../../lib/tileSettings';
import { MIRROR_DEFAULTS, type MirrorSettings } from './mirrorSettings';
import { SettingsRow, SettingsSection, Slider } from '../../settings/SettingsControls';

export interface MirrorSettingsBodyProps {
  tileId: string;
}

export function MirrorSettingsBody({ tileId }: MirrorSettingsBodyProps) {
  const [settings, setSettings] = useTileSettings<MirrorSettings>(
    tileId,
    'mirror',
    MIRROR_DEFAULTS,
  );

  return (
    <SettingsSection label="Display">
      <SettingsRow label="Overlay font size">
        <Slider
          min={10}
          max={16}
          step={1}
          value={settings.fontSize}
          onChange={(fontSize) => setSettings({ fontSize })}
          valueLabel={`${settings.fontSize}px`}
        />
      </SettingsRow>
    </SettingsSection>
  );
}
