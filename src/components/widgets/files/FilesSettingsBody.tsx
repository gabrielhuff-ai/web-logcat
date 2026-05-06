// Files settings modal body. Font size + starting path.

import { useTileSettings } from '../../../lib/tileSettings';
import { FILES_DEFAULTS, type FilesSettings } from './filesSettings';
import {
  SettingsRow,
  SettingsSection,
  Slider,
  TextInput,
} from '../../settings/SettingsControls';

export interface FilesSettingsBodyProps {
  tileId: string;
}

export function FilesSettingsBody({ tileId }: FilesSettingsBodyProps) {
  const [settings, setSettings] = useTileSettings<FilesSettings>(
    tileId,
    'files',
    FILES_DEFAULTS,
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

      <SettingsSection label="Files">
        <SettingsRow label="Starting path">
          <TextInput
            value={settings.startingPath}
            onChange={(startingPath) => setSettings({ startingPath })}
            placeholder="/sdcard"
            ariaLabel="Starting path"
          />
        </SettingsRow>
      </SettingsSection>
    </>
  );
}
