// Dumpsys settings modal body. Font size + default preset + default view.

import { useTileSettings } from '../../../lib/tileSettings';
import { DUMPSYS_DEFAULTS, type DumpsysSettings } from './dumpsysSettings';
import {
  SettingsRow,
  SettingsSection,
  Segmented,
  Slider,
} from '../../settings/SettingsControls';
import { DUMPSYS_PRESETS, type DumpsysPresetId } from '../../../lib/dumpsys';

export interface DumpsysSettingsBodyProps {
  tileId: string;
}

export function DumpsysSettingsBody({ tileId }: DumpsysSettingsBodyProps) {
  const [settings, setSettings] = useTileSettings<DumpsysSettings>(
    tileId,
    'dumpsys',
    DUMPSYS_DEFAULTS,
  );

  return (
    <>
      <SettingsSection label="Display">
        <SettingsRow label="Font size">
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

      <SettingsSection label="Defaults">
        <SettingsRow label="Default preset">
          <Segmented<DumpsysPresetId>
            value={settings.defaultPreset}
            onChange={(defaultPreset) => setSettings({ defaultPreset })}
            options={DUMPSYS_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
          />
        </SettingsRow>
        <SettingsRow label="Default view">
          <Segmented
            value={settings.defaultView}
            onChange={(defaultView) => setSettings({ defaultView })}
            options={[
              { value: 'cards', label: 'Parsed' },
              { value: 'raw', label: 'Raw' },
            ]}
          />
        </SettingsRow>
      </SettingsSection>
    </>
  );
}
