// Scripting widget — the builder (settings) modal.
//
// A large standalone modal (not the shared WidgetSettingsModal, which is a
// small centred dialog). Two-pane: shell-script editor + legend on the left, a
// controls list and per-control config form on the right, separated by a
// draggable split that can collapse the right pane. Portaled to document.body
// so it escapes the tile's backdrop-filter containing block.
//
// Edits apply live — every interaction writes straight to per-tile settings, so
// the panel updates as you build it. "Clear" resets to the initial state;
// Esc / scrim-click / × just close.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import * as Icons from '../../Icons';
import { useTileSettings } from '../../../lib/tileSettings';
import { extractFunctions } from '../../../lib/scripting/parseScript';
import { highlightShell } from '../../../lib/scripting/highlight';
import { varFromLabel } from '../../../lib/scripting/derive';
import {
  SCRIPTING_DEFAULTS,
  type ControlConfig,
  type ControlKind,
  type ScriptingSettings,
} from './scriptingSettings';
import { ConfigForm, type BindTarget } from './BuilderConfigForms';
import { PICKER, derivedName, makeControl } from './builderControls';

const MIN_SPLIT = 35;
const MAX_SPLIT = 80;

export interface ScriptingBuilderModalProps {
  tileId: string;
  onClose: () => void;
  /** `sh -n` error from the runtime (real devices only), shown inline. */
  scriptError?: string | null;
}

const DOCS_HREF = `${import.meta.env.BASE_URL}docs/features/scripting`;

export function ScriptingBuilderModal({ tileId, onClose, scriptError }: ScriptingBuilderModalProps) {
  const [settings, setSettings] = useTileSettings<ScriptingSettings>(
    tileId,
    'scripting',
    SCRIPTING_DEFAULTS,
  );

  const [selectedId, setSelectedId] = useState<string | null>(settings.controls[0]?.id ?? null);
  const [addOpen, setAddOpen] = useState(false);
  const [split, setSplit] = useState(60);
  const [collapsed, setCollapsed] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const bodyRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Keep the highlight overlay + line-number gutter aligned with the textarea
  // as it scrolls.
  const syncScroll = useCallback(() => {
    const ta = editorRef.current;
    if (!ta) return;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = ta.scrollTop;
      highlightRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutterRef.current) {
      gutterRef.current.style.transform = `translateY(${-ta.scrollTop}px)`;
    }
  }, []);

  const { script, controls, runAsRoot } = settings;

  const highlighted = useMemo(() => highlightShell(script), [script]);
  const lineCount = useMemo(() => Math.max(1, script.split('\n').length), [script]);
  const functions = useMemo(() => extractFunctions(script), [script]);
  const inputVars = useMemo(
    () =>
      controls
        .filter((c) => isInputKind(c.kind))
        .map((c) => ({ name: varFromLabel(labelOf(c)), label: labelOf(c) })),
    [controls],
  );
  const bindTargets = useMemo<BindTarget[]>(() => {
    const consoles = controls.filter((c) => c.kind === 'console');
    return [
      { value: 'console', label: 'console (default)' },
      ...consoles.map((c) => ({ value: c.id, label: labelOf(c) })),
    ];
  }, [controls]);

  const selected = controls.find((c) => c.id === selectedId) ?? null;

  // Edits write straight through to settings (live).
  const patchControl = <T extends ControlConfig>(id: string, patch: Partial<T>) => {
    setSettings({
      controls: controls.map((c) => (c.id === id ? ({ ...c, ...patch } as ControlConfig) : c)),
    });
  };

  const addControl = (kind: ControlKind) => {
    const c = makeControl(kind);
    setSettings({ controls: [...controls, c] });
    setSelectedId(c.id);
    setAddOpen(false);
  };

  const removeControl = (id: string) => {
    setSettings({ controls: controls.filter((c) => c.id !== id) });
    if (selectedId === id) setSelectedId(null);
  };

  const reorder = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const list = [...controls];
    const from = list.findIndex((c) => c.id === fromId);
    const to = list.findIndex((c) => c.id === toId);
    if (from === -1 || to === -1) return;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    setSettings({ controls: list });
  };

  const clearAll = () => {
    setSettings({
      script: SCRIPTING_DEFAULTS.script,
      runAsRoot: SCRIPTING_DEFAULTS.runAsRoot,
      controls: [],
      fontSize: SCRIPTING_DEFAULTS.fontSize,
    });
    setSelectedId(null);
    setAddOpen(false);
  };

  // Resizer drag — translate pointer X into a clamped split percentage.
  const onResizeDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = bodyRef.current;
    if (!el) return;
    const move = (ev: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setSplit(Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, pct)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, []);

  return createPortal(
    <>
      <div className="bdr-back" onClick={onClose} />
      <div className="bdr-modal" role="dialog" aria-label="Scripting settings">
        <div className="bdr-head">
          <span className="bdr-head-icon">
            <Icons.Code size={14} />
          </span>
          <div className="bdr-head-titles">
            <div className="bdr-head-title">Scripting · settings</div>
            <div className="bdr-head-sub">
              Build your panel — script and controls share one shell environment
            </div>
          </div>
          <span style={{ flex: 1 }} />
          <a
            className="bdr-pillbtn ghost"
            href={DOCS_HREF}
            target="_blank"
            rel="noopener noreferrer"
            data-tip="Open the Scripting docs"
          >
            <Icons.Book size={12} /> Help
          </a>
          <button
            className="bdr-pillbtn ghost"
            onClick={clearAll}
            aria-label="Clear"
            data-tip="Reset script and controls"
          >
            <Icons.Trash size={12} /> Clear
          </button>
          <button className="bdr-close" onClick={onClose} aria-label="Close">
            <Icons.Close size={13} />
          </button>
        </div>

        <div className="bdr-body" ref={bodyRef}>
          {/* LEFT — script + legend */}
          <div
            className="bdr-left"
            style={collapsed ? { flex: '1 1 auto' } : { flexBasis: `${split}%` }}
          >
            <div className="bdr-section-head">
              <span>Shell script</span>
              <span className="bdr-mini-hint">
                <Icons.Terminal size={10} /> mksh · POSIX-ish
              </span>
              <button
                type="button"
                className={'bdr-root-toggle' + (runAsRoot ? ' on' : '')}
                data-tip="Run as root (su). Falls back to user shell if su is unavailable."
                aria-pressed={runAsRoot}
                onClick={() => setSettings({ runAsRoot: !runAsRoot })}
              >
                <span className="bdr-root-text">Run as root</span>
                <span className={'bdr-root-tg ' + (runAsRoot ? 'on' : '')}>
                  <span className="bdr-root-tg-dot" />
                </span>
              </button>
            </div>
            <div className="bdr-editor">
              <div className="bdr-editor-gutter">
                <div className="bdr-editor-gutter-inner" ref={gutterRef}>
                  {Array.from({ length: lineCount }, (_, i) => i + 1).join('\n')}
                </div>
              </div>
              <div className="bdr-editor-code">
                <pre className="bdr-editor-hl" ref={highlightRef} aria-hidden>
                  <code dangerouslySetInnerHTML={{ __html: highlighted + '\n' }} />
                </pre>
                <textarea
                  className="bdr-editor-text"
                  ref={editorRef}
                  value={script}
                  onChange={(e) => setSettings({ script: e.target.value })}
                  onScroll={syncScroll}
                  spellCheck={false}
                  autoComplete="off"
                  aria-label="Shell script"
                />
              </div>
            </div>
            {scriptError && (
              <div className="bdr-script-error" role="alert">
                <span className="bdr-script-error-head">
                  <Icons.Code size={11} /> Script error
                </span>
                <pre>{scriptError}</pre>
              </div>
            )}
            <div className="bdr-legend">
              <div className="bdr-legend-head">
                <Icons.Hash size={10} /> Available variables
                <span className="bdr-legend-count">{inputVars.length}</span>
              </div>
              <div className="bdr-legend-chips">
                {inputVars.length === 0 ? (
                  <span style={{ color: 'var(--fg-3)', fontSize: 'var(--t-xs)' }}>
                    Add an input control to export a variable.
                  </span>
                ) : (
                  inputVars.map((v) => (
                    <code key={v.name} className="bdr-chip" data-tip={`From the "${v.label}" input.`}>
                      {v.name}
                    </code>
                  ))
                )}
              </div>
              <div className="bdr-legend-head" style={{ marginTop: 10 }}>
                <Icons.PlayCircle size={10} /> Functions
                <span className="bdr-legend-count">{functions.length}</span>
              </div>
              <div className="bdr-legend-chips">
                {functions.length === 0 ? (
                  <span style={{ color: 'var(--fg-3)', fontSize: 'var(--t-xs)' }}>
                    Define a shell function to call from a control.
                  </span>
                ) : (
                  functions.map((f) => (
                    <code key={f} className="bdr-chip fn">
                      {f}()
                    </code>
                  ))
                )}
              </div>
            </div>
          </div>

          {!collapsed && (
            <div
              className="bdr-resizer"
              role="separator"
              aria-orientation="vertical"
              data-tip="Drag to resize"
              onPointerDown={onResizeDown}
            >
              <span className="bdr-resizer-grip">
                <span />
                <span />
                <span />
              </span>
            </div>
          )}

          {/* RIGHT — controls list + config */}
          {!collapsed && (
            <div className="bdr-right">
              <div className="bdr-section-head">
                <span>
                  Controls <span style={{ color: 'var(--fg-3)' }}>· {controls.length}</span>
                </span>
                <span style={{ flex: 1 }} />
                <button
                  type="button"
                  className="bdr-mini-btn"
                  data-tip="Collapse to give the script editor the full width"
                  onClick={() => setCollapsed(true)}
                  aria-label="Collapse controls pane"
                >
                  <Icons.ChevronRight size={11} />
                </button>
                <button
                  type="button"
                  className="bdr-mini-btn primary"
                  onClick={() => setAddOpen((o) => !o)}
                  aria-expanded={addOpen}
                >
                  <Icons.Plus size={11} /> Add
                </button>
              </div>

              {addOpen && (
                <div className="bdr-add-menu">
                  {PICKER.map((p) => (
                    <button key={p.kind} type="button" className="bdr-add-item" onClick={() => addControl(p.kind)}>
                      <CtrlIcon kind={p.kind} />
                      {p.label}
                    </button>
                  ))}
                </div>
              )}

              <div className="bdr-ctrl-list">
                {controls.length === 0 ? (
                  <div className="bdr-ctrl-empty">No controls yet — use “+ Add”.</div>
                ) : (
                  controls.map((c) => (
                    <div
                      key={c.id}
                      className={
                        'bdr-ctrl-row' +
                        (c.id === selectedId ? ' selected' : '') +
                        (c.kind === 'section' ? ' is-section' : '') +
                        (c.id === dragId ? ' dragging' : '')
                      }
                      draggable
                      onDragStart={() => setDragId(c.id)}
                      onDragEnd={() => setDragId(null)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragId) reorder(dragId, c.id);
                        setDragId(null);
                      }}
                      onClick={() => setSelectedId(c.id)}
                    >
                      <span className="bdr-ctrl-drag">
                        <Icons.Drag size={11} />
                      </span>
                      <span className={'bdr-ctrl-kind kind-' + c.kind}>
                        <CtrlIcon kind={c.kind} />
                      </span>
                      <span className="bdr-ctrl-label">{labelOf(c)}</span>
                      <span className="bdr-ctrl-derived">{derivedName(c)}</span>
                      <button
                        type="button"
                        className="bdr-ctrl-del"
                        aria-label={`Delete ${labelOf(c)}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeControl(c.id);
                        }}
                      >
                        <Icons.Trash size={11} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {selected ? (
                <>
                  <div className="bdr-config-head">
                    <span>Edit:</span>
                    <span className={'bdr-ctrl-kind kind-' + selected.kind}>
                      <CtrlIcon kind={selected.kind} />
                    </span>
                    <span className="bdr-config-name">{labelOf(selected)}</span>
                    <span className="bdr-config-derived">{derivedName(selected)}</span>
                  </div>
                  <div className="bdr-config-body">
                    <ConfigForm
                      control={selected}
                      onPatch={patchControl}
                      functions={functions}
                      bindTargets={bindTargets}
                      script={script}
                    />
                  </div>
                </>
              ) : (
                <div className="bdr-config-empty">Select a control to edit it, or add one.</div>
              )}
            </div>
          )}

          {collapsed && (
            <button
              type="button"
              className="bdr-expand-bar"
              data-tip="Expand controls pane"
              aria-label="Expand controls pane"
              onClick={() => setCollapsed(false)}
            >
              <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}>
                <Icons.ChevronRight size={14} />
              </span>
              <span className="bdr-expand-count">{controls.length} controls</span>
            </button>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}

function labelOf(c: ControlConfig): string {
  return c.kind === 'section' ? c.title : c.label;
}

function isInputKind(kind: ControlKind): boolean {
  return (
    kind === 'text' ||
    kind === 'slider' ||
    kind === 'toggle' ||
    kind === 'select' ||
    kind === 'stepper' ||
    kind === 'knob'
  );
}

function CtrlIcon({ kind }: { kind: ControlKind }): ReactNode {
  switch (kind) {
    case 'text':
      return <Icons.Edit size={11} />;
    case 'slider':
      return <Icons.SplitV size={11} />;
    case 'button':
      return <Icons.PlayCircle size={11} />;
    case 'toggle':
      return <Icons.Power size={11} />;
    case 'knob':
      return <Icons.Rotate size={11} />;
    case 'stepper':
      return <Icons.Hash size={11} />;
    case 'select':
      return <Icons.Chevron size={11} />;
    case 'console':
      return <Icons.Terminal size={11} />;
    case 'readout':
      return <Icons.Battery size={11} />;
    case 'gauge':
      return <Icons.Cpu size={11} />;
    case 'led':
      return <Icons.Network size={11} />;
    case 'status':
      return <Icons.PlayCircle size={11} />;
    case 'section':
      return <Icons.Folder size={11} />;
  }
}
