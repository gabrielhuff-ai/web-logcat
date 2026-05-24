// Scripting widget — the builder (settings) modal.
//
// A large standalone modal (not the shared WidgetSettingsModal, which is a
// small centred dialog). Two-pane: shell script editor on the left, controls
// list + per-control config on the right. Portaled to document.body so it
// escapes the tile's backdrop-filter containing block.
//
// Edits accumulate in a local draft; "Save panel" commits to per-tile
// settings, "Discard" / Esc / scrim-click cancels. This M1 version wires the
// script editor and the save/discard cycle; the controls pane is built out in
// a later milestone.

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import * as Icons from '../../Icons';
import { useTileSettings } from '../../../lib/tileSettings';
import { SCRIPTING_DEFAULTS, type ScriptingSettings } from './scriptingSettings';

export interface ScriptingBuilderModalProps {
  tileId: string;
  onClose: () => void;
}

export function ScriptingBuilderModal({ tileId, onClose }: ScriptingBuilderModalProps) {
  const [settings, setSettings] = useTileSettings<ScriptingSettings>(
    tileId,
    'scripting',
    SCRIPTING_DEFAULTS,
  );

  // Local draft — committed on Save, dropped on Discard/close.
  const [draft, setDraft] = useState<ScriptingSettings>(settings);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = useCallback(() => {
    setSettings(draft);
    onClose();
  }, [draft, setSettings, onClose]);

  return createPortal(
    <>
      <div className="bdr-back" onClick={onClose} />
      <div className="bdr-modal" role="dialog" aria-label="Scripting settings">
        <div className="bdr-head">
          <span className="bdr-head-icon">
            <Icons.Wand size={14} />
          </span>
          <div className="bdr-head-titles">
            <div className="bdr-head-title">Scripting · settings</div>
            <div className="bdr-head-sub">
              Build your panel — script and controls share one shell environment
            </div>
          </div>
          <span style={{ flex: 1 }} />
          <button className="bdr-pillbtn ghost" onClick={onClose}>
            Discard
          </button>
          <button className="bdr-pillbtn primary" onClick={save}>
            Save panel
          </button>
          <button className="bdr-close" onClick={onClose} aria-label="Close">
            <Icons.Close size={13} />
          </button>
        </div>

        <div className="bdr-body">
          <div className="bdr-left" style={{ flexBasis: '60%' }}>
            <div className="bdr-section-head">
              <span>Shell script</span>
              <span className="bdr-mini-hint">
                <Icons.Terminal size={10} /> mksh · POSIX-ish
              </span>
              <button
                type="button"
                className={'bdr-root-toggle' + (draft.runAsRoot ? ' on' : '')}
                data-tip="Run as root (su). Falls back to user shell if su is unavailable."
                aria-pressed={draft.runAsRoot}
                onClick={() => setDraft((d) => ({ ...d, runAsRoot: !d.runAsRoot }))}
              >
                <span className="bdr-root-text">Run as root</span>
                <span className={'bdr-root-tg ' + (draft.runAsRoot ? 'on' : '')}>
                  <span className="bdr-root-tg-dot" />
                </span>
              </button>
            </div>
            <div className="bdr-editor">
              <textarea
                className="bdr-editor-text"
                value={draft.script}
                onChange={(e) => setDraft((d) => ({ ...d, script: e.target.value }))}
                spellCheck={false}
                autoComplete="off"
                aria-label="Shell script"
              />
            </div>
          </div>

          <div className="bdr-resizer" aria-hidden>
            <span className="bdr-resizer-grip">
              <span />
              <span />
              <span />
            </span>
          </div>

          <div className="bdr-right">
            <div className="bdr-section-head">
              <span>
                Controls <span style={{ color: 'var(--fg-3)' }}>· {draft.controls.length}</span>
              </span>
            </div>
            <div className="bdr-config-empty">
              Control authoring lands in the next milestone. The script above is saved with the
              panel.
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
