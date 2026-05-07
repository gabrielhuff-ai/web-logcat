// Global settings modal — dashboard-wide preferences that don't fit in
// the Appearance popover. Currently:
//
//   - Performance mode (auto / on / off) — drops blur + animations and
//     caps Mirror fps on Intel iGPU laptops. Was in Appearance; moved
//     here to make room for future controls.
//   - Streaming speed — multiplier on the simulated logcat ingest
//     rate. Useful for stress-testing the virtualiser locally.
//   - Reset to defaults — wipes the global Tweaks bucket back to
//     `DEFAULT_TWEAKS`.

import './../styles/widgets/settings.css';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import * as Icons from './Icons';
import { Toggle } from './settings/SettingsControls';
import { DEFAULT_TWEAKS } from '../lib/tweaks';
import { APP_VERSION } from '../version';
import type { Tweaks } from '../types';

export interface GlobalSettingsModalProps {
  tweaks: Tweaks;
  setTweaks: (patch: Partial<Tweaks>) => void;
  onClose: () => void;
}

export function GlobalSettingsModal({
  tweaks,
  setTweaks,
  onClose,
}: GlobalSettingsModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <>
      <div className="ws-back" onClick={onClose} />
      <div className="ws-modal" role="dialog" aria-label="Global settings">
        <div className="ws-head">
          <h3>Global settings</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icons.Close size={12} />
          </button>
        </div>
        <div className="ws-body">
          <div className="ws-section">
            <div className="ws-row gs-row-stacked">
              <div className="gs-row-head">
                <span className="ws-row-key">Performance mode</span>
                <span className="gs-row-desc">
                  Drops blur, animated decorations, and caps the Mirror
                  widget at 30 fps. Auto enables this on Intel iGPU laptops
                  and when the system requests reduced motion.
                </span>
              </div>
              <div className="ws-seg">
                <button
                  className={tweaks.performanceMode === 'auto' ? 'on' : ''}
                  onClick={() => setTweaks({ performanceMode: 'auto' })}
                >
                  Auto
                </button>
                <button
                  className={tweaks.performanceMode === 'on' ? 'on' : ''}
                  onClick={() => setTweaks({ performanceMode: 'on' })}
                >
                  On
                </button>
                <button
                  className={tweaks.performanceMode === 'off' ? 'on' : ''}
                  onClick={() => setTweaks({ performanceMode: 'off' })}
                >
                  Off
                </button>
              </div>
            </div>
          </div>

          <div className="ws-section">
            <div className="ws-row gs-row-stacked">
              <div className="gs-row-head">
                <span className="ws-row-key">Simulated stream speed</span>
                <span className="gs-row-desc">
                  Multiplier on the fake-data ingest rate. Useful for
                  stress-testing the virtualiser; ignored when a real
                  device is connected.
                </span>
              </div>
              <div className="ws-slider">
                <input
                  type="range"
                  min={0.25}
                  max={4}
                  step={0.25}
                  value={tweaks.streamingSpeed}
                  onChange={(e) =>
                    setTweaks({ streamingSpeed: Number(e.target.value) })
                  }
                  aria-label="Simulated stream speed"
                />
                <span className="ws-slider-label">{tweaks.streamingSpeed}×</span>
              </div>
            </div>
          </div>

          <div className="ws-section">
            <div className="ws-row">
              <div className="gs-row-head">
                <span className="ws-row-key">Show heatmap by default</span>
                <span className="gs-row-desc">
                  New Logcat tiles render the level-rate heatmap gutter
                  until you flip it off in their settings.
                </span>
              </div>
              <Toggle
                on={tweaks.showHeatmap}
                onChange={(v) => setTweaks({ showHeatmap: v })}
                ariaLabel="Show heatmap by default"
              />
            </div>
          </div>

          <div className="ws-section">
            <button
              className="ws-btn"
              onClick={() => setTweaks({ ...DEFAULT_TWEAKS })}
            >
              Reset to defaults
            </button>
          </div>
        </div>
        <div className="ws-version">v{APP_VERSION}</div>
      </div>
    </>,
    document.body,
  );
}
