// Per-widget settings modal — scrim + dialog modeled on `WidgetPalette`.
// Renders the kind-specific settings body inside a consistent header /
// scroll body chrome. Closed via Esc, scrim click, and the close button
// (matching the palette's three-way dismissal).
//
// The scrim + dialog are portaled to `document.body` so they escape the
// nearest `.tile`'s `backdrop-filter` containing block (which would
// otherwise re-anchor `position: fixed` to the tile and clip the
// modal). With the portal, the scrim spans the full viewport and blurs
// the entire app behind it.
//
// Each `<Tile/>` mounts its own modal instance; the modal renders
// nothing until `open === true`, so unrelated tiles pay zero cost. The
// body components read / write through `useTileSettings` so changes
// flow straight back into the rendered widget.

import '../styles/widgets/settings.css';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import * as Icons from './Icons';
import { WIDGETS } from '../lib/widgets';
import type { WidgetKind } from '../types';
import { LogcatSettingsBody } from './widgets/logcat/LogcatSettingsBody';
import { ShellSettingsBody } from './widgets/shell/ShellSettingsBody';
import { DumpsysSettingsBody } from './widgets/dumpsys/DumpsysSettingsBody';
import { FilesSettingsBody } from './widgets/files/FilesSettingsBody';
import { MirrorSettingsBody } from './widgets/mirror/MirrorSettingsBody';

export interface WidgetSettingsModalProps {
  tileId: string;
  kind: WidgetKind;
  onClose: () => void;
}

export function WidgetSettingsModal({ tileId, kind, onClose }: WidgetSettingsModalProps) {
  // Esc closes. Scrim has its own click handler.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const def = WIDGETS[kind];
  const title = `${def.name} · settings`;

  return createPortal(
    <>
      <div className="ws-back" onClick={onClose} />
      <div className="ws-modal" role="dialog" aria-label={title}>
        <div className="ws-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icons.Close size={12} />
          </button>
        </div>
        <div className="ws-body">{renderBody(kind, tileId)}</div>
      </div>
    </>,
    document.body,
  );
}

function renderBody(kind: WidgetKind, tileId: string) {
  switch (kind) {
    case 'logcat':
      return <LogcatSettingsBody tileId={tileId} />;
    case 'shell':
      return <ShellSettingsBody tileId={tileId} />;
    case 'dumpsys':
      return <DumpsysSettingsBody tileId={tileId} />;
    case 'files':
      return <FilesSettingsBody tileId={tileId} />;
    case 'mirror':
      return <MirrorSettingsBody tileId={tileId} />;
  }
}
