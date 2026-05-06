// Shell settings modal body. Two settings: font size + home directory.

import { useTileSettings } from '../../../lib/tileSettings';
import { SHELL_DEFAULTS, type ShellSettings } from './shellSettings';
import {
  SettingsRow,
  SettingsSection,
  Slider,
  TextInput,
} from '../../settings/SettingsControls';

export interface ShellSettingsBodyProps {
  tileId: string;
}

export function ShellSettingsBody({ tileId }: ShellSettingsBodyProps) {
  const [settings, setSettings] = useTileSettings<ShellSettings>(
    tileId,
    'shell',
    SHELL_DEFAULTS,
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

      <SettingsSection label="Shell">
        <SettingsRow label="Home directory">
          <TextInput
            value={settings.homeDir}
            onChange={(homeDir) => setSettings({ homeDir })}
            placeholder="/sdcard"
            ariaLabel="Home directory"
          />
        </SettingsRow>
      </SettingsSection>
    </>
  );
}
