// Keyboard-shortcut reference dialog. Opened with `?` (when not typing
// in an input), closes on Esc, scrim click, or the Close button.

import { useEffect } from 'react';
import * as Icons from './Icons';

export interface HelpDialogProps {
  open: boolean;
  onClose: () => void;
}

interface Shortcut {
  keys: string[];
  desc: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: ['Space'], desc: 'Pause / resume the live stream' },
  { keys: ['/'], desc: 'Focus the filter input' },
  { keys: ['⌘', 'F'], desc: 'Open search overlay' },
  { keys: ['⌘', 'K'], desc: 'Clear the log buffer' },
  { keys: ['?'], desc: 'Open this dialog' },
  { keys: ['Esc'], desc: 'Close any open overlay (search, palette, this)' },
  { keys: ['Tab'], desc: '(In filter input) accept the highlighted suggestion' },
  { keys: ['Enter'], desc: '(In filter input) commit the chip' },
  { keys: ['Backspace'], desc: '(In filter input, empty) delete the last chip' },
  { keys: ['Click'], desc: '(On a level pill) toggle that level' },
  { keys: ['Double-click'], desc: '(On a level pill) solo that level' },
  { keys: ['Click'], desc: '(On a heatmap cell) jump to that second in the log' },
];

export function HelpDialog({ open, onClose }: HelpDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="help-scrim" onClick={onClose} />
      <div className="help" role="dialog" aria-label="Keyboard shortcuts">
        <div className="help-head">
          <h2>Keyboard shortcuts</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icons.Close size={14} />
          </button>
        </div>
        <div className="help-body">
          <table className="help-table">
            <tbody>
              {SHORTCUTS.map((s, i) => (
                <tr key={i}>
                  <td className="help-keys">
                    {s.keys.map((k, j) => (
                      <span key={j} className="kbd">
                        {k}
                      </span>
                    ))}
                  </td>
                  <td className="help-desc">{s.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
