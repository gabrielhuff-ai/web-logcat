// Shell settings modal body — font size + home directory + run-as-root.

import { useTileSettings } from '../../../lib/tileSettings';
import { SHELL_DEFAULTS, type ShellSettings } from './shellSettings';
import {
  SettingsRow,
  SettingsSection,
  Slider,
  TextInput,
  Toggle,
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
        <SettingsRow label="Run as root">
          <Toggle
            on={settings.runAsRoot}
            onChange={(runAsRoot) => setSettings({ runAsRoot })}
            ariaLabel="Run as root"
          />
        </SettingsRow>
      </SettingsSection>
    </>
  );
}
