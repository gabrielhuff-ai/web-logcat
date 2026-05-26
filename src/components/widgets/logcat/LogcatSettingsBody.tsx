// Modal body for Logcat settings — ports the v1 SettingsPanel patterns
// (segmented control, toggle pill, value sliders) into the per-widget
// modal. Bar controls and modal controls both write through the same
// `useTileSettings`-backed setter, so flips propagate either direction.

import { useMemo } from 'react';
import { useTileSettings } from '../../../lib/tileSettings';
import { LOGCAT_DEFAULTS, type LogcatSettings } from './logcatSettings';
import { SettingsRow, SettingsSection, Segmented, Toggle, Slider } from '../../settings/SettingsControls';
import { formatTs, type TimestampFormat } from '../../../lib/format';
import type { LogLevel } from '../../../types';

export interface LogcatSettingsBodyProps {
  tileId: string;
}

const LEVELS: ReadonlyArray<{ l: LogLevel; label: string }> = [
  { l: 'V', label: 'Verbose' },
  { l: 'D', label: 'Debug' },
  { l: 'I', label: 'Info' },
  { l: 'W', label: 'Warn' },
  { l: 'E', label: 'Error' },
];

const DATE_FORMATS: ReadonlyArray<{ value: TimestampFormat; label: string }> = [
  { value: 'datetime', label: 'Date' },
  { value: 'time', label: 'Time' },
  { value: 'clock', label: 'Clock' },
];

// Fixed sample so the picker's preview is deterministic regardless of
// the wall clock. Built from local components so the rendered date /
// time matches the user's locale the same way live rows do.
const SAMPLE_TS = new Date(2024, 4, 25, 20, 41, 9, 261).getTime();

export function LogcatSettingsBody({ tileId }: LogcatSettingsBodyProps) {
  const [settings, setSettings] = useTileSettings<LogcatSettings>(
    tileId,
    'logcat',
    LOGCAT_DEFAULTS,
  );

  const filterSummary = useMemo(() => {
    const n = settings.filters.length;
    if (n === 0) return 'No filters';
    if (n === 1) return '1 filter';
    return `${n} filters`;
  }, [settings.filters]);

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
        <SettingsRow label="Density">
          <Segmented
            value={settings.density}
            onChange={(density) => setSettings({ density })}
            options={[
              { value: 'compact', label: 'Compact' },
              { value: 'comfortable', label: 'Comfortable' },
            ]}
          />
        </SettingsRow>
        <SettingsRow label="Heatmap gutter">
          <Toggle
            on={settings.heatmap}
            onChange={(heatmap) => setSettings({ heatmap })}
            ariaLabel="Heatmap gutter"
          />
        </SettingsRow>
        <SettingsRow label="Wrap long lines">
          <Toggle
            on={settings.wrap}
            onChange={(wrap) => setSettings({ wrap })}
            ariaLabel="Wrap"
          />
        </SettingsRow>
        <div className="ws-row gs-row-stacked">
          <div className="gs-row-head">
            <span className="ws-row-key">Timestamp format</span>
            <span className="gs-row-desc">
              Shorter formats drop the date, then the milliseconds, to
              reclaim column width. Preview:{' '}
              <code>{formatTs(SAMPLE_TS, settings.dateFormat)}</code>
            </span>
          </div>
          <Segmented
            value={settings.dateFormat}
            onChange={(dateFormat) => setSettings({ dateFormat })}
            options={DATE_FORMATS}
          />
        </div>
      </SettingsSection>

      <SettingsSection label="Columns">
        <SettingsRow label="Timestamp">
          <Toggle
            on={settings.showTimestamp}
            onChange={(showTimestamp) => setSettings({ showTimestamp })}
            ariaLabel="Show timestamp"
          />
        </SettingsRow>
        <SettingsRow label="PID / TID">
          <Toggle
            on={settings.showPid}
            onChange={(showPid) => setSettings({ showPid })}
            ariaLabel="Show PID"
          />
        </SettingsRow>
        <SettingsRow label="Process">
          <Toggle
            on={settings.showProcess}
            onChange={(showProcess) => setSettings({ showProcess })}
            ariaLabel="Show process"
          />
        </SettingsRow>
        <SettingsRow label="Tag">
          <Toggle
            on={settings.showTag}
            onChange={(showTag) => setSettings({ showTag })}
            ariaLabel="Show tag"
          />
        </SettingsRow>
        <SettingsRow label="Verbosity column">
          <Toggle
            on={settings.showLevel}
            onChange={(showLevel) => setSettings({ showLevel })}
            ariaLabel="Show level"
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection label="Levels">
        <div className="ws-levels">
          {LEVELS.map(({ l, label }) => {
            const on = settings.levelEnabled[l];
            return (
              <button
                key={l}
                type="button"
                className={`lvl-pill lvl-${l} ${on ? 'on' : 'off'}`}
                onClick={() =>
                  setSettings({
                    levelEnabled: { ...settings.levelEnabled, [l]: !on },
                  })
                }
                title={label}
              >
                <span className="lvl-letter">{l}</span>
                <span className="lvl-name">{label}</span>
              </button>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection label="Stream">
        <SettingsRow label="Auto-scroll">
          <Toggle
            on={settings.autoScroll}
            onChange={(autoScroll) => setSettings({ autoScroll })}
            ariaLabel="Auto-scroll"
          />
        </SettingsRow>
        <SettingsRow label="Pause">
          <Toggle
            on={settings.paused}
            onChange={(paused) => setSettings({ paused })}
            ariaLabel="Pause"
          />
        </SettingsRow>
      </SettingsSection>

      {/* Decision: filters render as a read-only summary with a clear
          action. Embedding the full FilterBar inside the modal would
          duplicate complex autocomplete UI for marginal gain — the
          on-bar input is the natural authoring surface, the modal is
          the at-a-glance summary + reset. */}
      <SettingsSection label="Filters">
        <SettingsRow label={filterSummary}>
          <button
            type="button"
            className="ws-btn"
            disabled={settings.filters.length === 0}
            onClick={() => setSettings({ filters: [] })}
          >
            Clear filters
          </button>
        </SettingsRow>
      </SettingsSection>
    </>
  );
}
