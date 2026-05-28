// Dashboard import / export modal.
//
// Export: encode the current dashboard (layout + all per-tile settings) and
// offer copy-to-clipboard, save-to-file, or copy-link (only when the encoded
// payload is small enough for a URL fragment). Import: paste text or load a
// file, then apply — gated behind an explicit acknowledgement when the
// dashboard carries scripting panels that run shell commands.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as Icons from './Icons';
import {
  applySnapshot,
  buildShareUrl,
  captureSnapshot,
  decodeSnapshot,
  encodeSnapshot,
  fitsInUrl,
  hasScripts,
  type DashboardSnapshot,
} from '../lib/dashboardShare';

export interface DashboardShareModalProps {
  onClose: () => void;
  /** Called after a successful import so the dashboard can re-render live. */
  onImported: () => void;
}

type Copied = 'text' | 'link' | null;

export function DashboardShareModal({ onClose, onImported }: DashboardShareModalProps) {
  const [encoded, setEncoded] = useState<string | null>(null);
  const [copied, setCopied] = useState<Copied>(null);

  const [importText, setImportText] = useState('');
  const [decoded, setDecoded] = useState<DashboardSnapshot | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [shake, setShake] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Encode the current dashboard once on open.
  useEffect(() => {
    let cancelled = false;
    void encodeSnapshot(captureSnapshot()).then((e) => {
      if (!cancelled) setEncoded(e);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Decode whatever is in the import box (debounced via React batching).
  useEffect(() => {
    const text = importText.trim();
    if (!text) {
      setDecoded(null);
      setImportError(null);
      return;
    }
    let cancelled = false;
    void decodeSnapshot(text).then((d) => {
      if (cancelled) return;
      setDecoded(d);
      setImportError(d ? null : 'Not a valid WebLogcat dashboard.');
      setAck(false);
    });
    return () => {
      cancelled = true;
    };
  }, [importText]);

  const flashCopied = (which: Copied) => {
    setCopied(which);
    window.setTimeout(() => setCopied((c) => (c === which ? null : c)), 1200);
  };

  const copyText = () => {
    if (!encoded) return;
    void navigator.clipboard?.writeText(encoded).then(() => flashCopied('text'));
  };
  const copyLink = () => {
    if (!encoded || !fitsInUrl(encoded)) return;
    void navigator.clipboard?.writeText(buildShareUrl(encoded)).then(() => flashCopied('link'));
  };
  const saveFile = () => {
    if (!encoded) return;
    const blob = new Blob([encoded], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'weblogcat-dashboard.wlc';
    a.click();
    URL.revokeObjectURL(url);
  };

  const onFile = (file: File) => {
    void file.text().then((t) => setImportText(t.trim()));
  };

  const scriptsPresent = decoded ? hasScripts(decoded) : false;
  const canImport = decoded != null && (!scriptsPresent || ack);

  // The button stays clickable while "disabled-looking" so clicking it can
  // nudge the user toward the unchecked acknowledgement (a real `disabled`
  // attribute would swallow the click).
  const onImportClick = () => {
    if (!decoded) return;
    if (scriptsPresent && !ack) {
      setShake(true);
      window.setTimeout(() => setShake(false), 450);
      return;
    }
    // Apply in place — the device is already connected, so no reload.
    applySnapshot(decoded);
    onImported();
  };

  const linkOk = encoded != null && fitsInUrl(encoded);

  return createPortal(
    <>
      <div className="imex-back" onClick={onClose} />
      <div className="imex-modal" role="dialog" aria-label="Import or export dashboard">
        <div className="imex-head">
          <span className="imex-head-icon">
            <Icons.Share size={14} />
          </span>
          <div className="imex-head-titles">
            <div className="imex-head-title">Share dashboard</div>
            <div className="imex-head-sub">Export this dashboard, or import one</div>
          </div>
          <span style={{ flex: 1 }} />
          <button className="imex-close" onClick={onClose} aria-label="Close">
            <Icons.Close size={13} />
          </button>
        </div>

        <div className="imex-body">
          <section className="imex-section">
            <h4>Export</h4>
            <p className="imex-note">
              Includes the layout and every tile&apos;s settings. Settings are not tied to a device
              serial, so they apply on whichever device imports them.
            </p>
            <div className="imex-row">
              <button className="btn" onClick={copyText} disabled={!encoded}>
                {copied === 'text' ? <Icons.Check size={13} /> : <Icons.Copy size={13} />} Copy text
              </button>
              <button className="btn" onClick={saveFile} disabled={!encoded}>
                <Icons.Download size={13} /> Save file
              </button>
              <button
                className="btn"
                onClick={copyLink}
                disabled={!linkOk}
                title={linkOk ? undefined : 'Dashboard is too large for a link — use text or file'}
              >
                {copied === 'link' ? <Icons.Check size={13} /> : <Icons.Share size={13} />} Copy link
              </button>
            </div>
            {encoded && !linkOk && (
              <p className="imex-note imex-warn">
                Too large for a shareable link — use “Copy text” or “Save file” instead.
              </p>
            )}
          </section>

          <div className="imex-divider" />

          <section className="imex-section">
            <h4>Import</h4>
            <p className="imex-note">Replaces your current layout. Paste exported text or load a file.</p>
            <textarea
              className="imex-textarea"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Paste exported dashboard text here…"
              spellCheck={false}
            />
            {importError && <p className="imex-note imex-warn">{importError}</p>}
            {scriptsPresent && (
              <label className={'imex-ack' + (shake ? ' shake' : '')}>
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                <span>
                  This dashboard includes <strong>scripting panels that may run shell commands</strong>{' '}
                  on your device, some of which may run in the background (see{' '}
                  <a
                    href={`${import.meta.env.BASE_URL}docs/features/scripting#daemon`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Daemons
                  </a>
                  ). Check this box to confirm that you trust the authors of this dashboard.
                </span>
              </label>
            )}
            <div className="imex-row">
              <button className="btn" onClick={() => fileRef.current?.click()}>
                <Icons.Upload size={13} /> Load file
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".wlc,.txt,text/plain"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                  e.target.value = '';
                }}
              />
              <span style={{ flex: 1 }} />
              <button
                className={'btn primary' + (canImport ? '' : ' imex-btn-disabled')}
                aria-disabled={!canImport}
                onClick={onImportClick}
              >
                Import dashboard
              </button>
            </div>
          </section>
        </div>
      </div>
    </>,
    document.body,
  );
}
