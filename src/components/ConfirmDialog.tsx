// Material-style confirm / prompt dialogs — replacements for the
// browser's `window.confirm` / `window.prompt`, which look out of
// place inside the dashboard chrome and (on macOS) sit at the very
// top of the window with no visual relationship to the calling
// widget. Both render via a portal to `document.body` so they sit
// above tile transforms.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as Icons from './Icons';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      else if (e.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;
  return createPortal(
    <>
      <div className="md-scrim" onClick={onCancel} />
      <div className="md-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="md-dialog-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onCancel} aria-label="Close">
            <Icons.Close size={14} />
          </button>
        </div>
        <div className="md-dialog-body">{message}</div>
        <div className="md-dialog-actions">
          <button type="button" className="md-btn md-btn-text" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`md-btn ${destructive ? 'md-btn-destructive' : 'md-btn-primary'}`}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

export interface PromptDialogProps {
  open: boolean;
  title: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  okLabel?: string;
  cancelLabel?: string;
  validate?: (value: string) => string | null;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export function PromptDialog({
  open,
  title,
  label,
  placeholder,
  defaultValue = '',
  okLabel = 'OK',
  cancelLabel = 'Cancel',
  validate,
  onSubmit,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(defaultValue);
      setError(null);
      // Focus the input on next tick so the autoFocus + portal mount
      // race doesn't drop focus into the void.
      window.setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [open, defaultValue]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  const submit = () => {
    const err = validate?.(value) ?? null;
    if (err) {
      setError(err);
      return;
    }
    onSubmit(value);
  };

  if (!open) return null;
  return createPortal(
    <>
      <div className="md-scrim" onClick={onCancel} />
      <div className="md-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="md-dialog-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onCancel} aria-label="Close">
            <Icons.Close size={14} />
          </button>
        </div>
        <div className="md-dialog-body">
          {label && <label className="md-prompt-label">{label}</label>}
          <input
            ref={inputRef}
            className="md-prompt-input"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={placeholder}
            spellCheck={false}
          />
          {error && <div className="md-prompt-error">{error}</div>}
        </div>
        <div className="md-dialog-actions">
          <button type="button" className="md-btn md-btn-text" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="md-btn md-btn-primary" onClick={submit}>
            {okLabel}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
