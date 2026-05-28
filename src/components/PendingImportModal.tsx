// Confirmation modal for dashboard imports that arrive via a `#share=…` URL.
//
// The pasted-text path lives inside `DashboardShareModal` — the user is
// already there. URL imports skip that surface entirely (the snapshot is
// stashed at boot, or as the hash changes in-tab), so we need a parallel
// trust gate. The message mirrors the export modal's acknowledgement word
// for word — same threat, same wording, same docs link.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as Icons from './Icons';
import { hasScripts, type DashboardSnapshot } from '../lib/dashboardShare';

export interface PendingImportModalProps {
  snapshot: DashboardSnapshot;
  /** Apply the snapshot (caller writes it through `applySnapshot`). */
  onConfirm: () => void;
  /** Drop the snapshot without applying. */
  onCancel: () => void;
}

export function PendingImportModal({ snapshot, onConfirm, onCancel }: PendingImportModalProps) {
  const [ack, setAck] = useState(false);
  const [shake, setShake] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const scriptsPresent = hasScripts(snapshot);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const canConfirm = !scriptsPresent || ack;

  // Button stays clickable while "disabled-looking" so clicking it nudges
  // the user toward the unchecked ack — same trick as the share modal.
  const onConfirmClick = () => {
    if (scriptsPresent && !ack) {
      setShake(true);
      window.setTimeout(() => setShake(false), 450);
      return;
    }
    onConfirm();
  };

  return createPortal(
    <>
      <div className="imex-back" onClick={onCancel} />
      <div className="imex-modal" role="dialog" aria-label="Import shared dashboard">
        <div className="imex-head">
          <span className="imex-head-icon">
            <Icons.Share size={14} />
          </span>
          <div className="imex-head-titles">
            <div className="imex-head-title">Import shared dashboard</div>
            <div className="imex-head-sub">Replaces your current layout</div>
          </div>
          <span style={{ flex: 1 }} />
          <button className="imex-close" onClick={onCancel} aria-label="Close">
            <Icons.Close size={13} />
          </button>
        </div>

        <div className="imex-body">
          <section className="imex-section">
            <p className="imex-note">
              You opened a WebLogcat share link. Applying it replaces your current dashboard with the
              shared one.
            </p>
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
              <button className="btn" onClick={onCancel}>
                Discard
              </button>
              <span style={{ flex: 1 }} />
              <button
                ref={confirmRef}
                className={'btn primary' + (canConfirm ? '' : ' imex-btn-disabled')}
                aria-disabled={!canConfirm}
                onClick={onConfirmClick}
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
