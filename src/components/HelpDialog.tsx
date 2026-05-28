// Keyboard-shortcut reference dialog. Opened with `?` (when not typing
// in an input), closes on Esc, scrim click, or the Close button.

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import * as Icons from './Icons';

export interface HelpDialogProps {
  open: boolean;
  onClose: () => void;
}

interface Shortcut {
  keys: string[];
  desc: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: Shortcut[];
}

const GROUPS: ShortcutGroup[] = [
  {
    title: 'Dashboard',
    shortcuts: [
      { keys: ['⌘', 'E'], desc: 'Open the quick-add widget menu' },
      { keys: ['↑', '↓', '←', '→'], desc: 'Move the focused-tile ring' },
      { keys: ['Backspace'], desc: 'Remove the focused tile (or in Files, delete the selected entry)' },
      { keys: ['Delete'], desc: 'Same as Backspace' },
      { keys: ['⌘', 'Z'], desc: 'Undo the last layout edit' },
      { keys: ['⌘', '⇧', 'Z'], desc: 'Redo' },
      { keys: ['?'], desc: 'Open this dialog' },
      { keys: ['Esc'], desc: 'Close any open overlay' },
    ],
  },
  {
    title: 'Screen Mirror',
    shortcuts: [
      { keys: ['Click'], desc: 'Tap / drag / swipe at the click position on the device' },
      { keys: ['Type'], desc: 'Forward letters and editor keys (Backspace, Enter, Tab, arrows, Esc) to the device' },
      { keys: ['⌘', 'V'], desc: 'Paste the host clipboard into the device' },
      { keys: ['⌘', 'C'], desc: 'Forward Ctrl+C to the device and pull the resulting clipboard to the host' },
      { keys: ['⇧', '←/→/↑/↓'], desc: 'Extend the device-side selection by character / line' },
      { keys: ['⌘', '←/→'], desc: 'Move cursor to start / end of line on the device' },
      { keys: ['⌘', '↑/↓'], desc: 'Move cursor to start / end of document on the device' },
      { keys: ['⌘', '⇧', '←/→/↑/↓'], desc: 'Same as above but extend the selection' },
      { keys: ['⌥', '←/→'], desc: 'Move cursor by word (add ⇧ to extend selection)' },
    ],
  },
  {
    title: 'Logcat',
    shortcuts: [
      { keys: ['Space'], desc: 'Pause / resume the live stream' },
      { keys: ['/'], desc: 'Focus the filter input' },
      { keys: ['⌘', 'F'], desc: 'Focus the filter input (same as /)' },
      { keys: ['⌘', 'G'], desc: 'Next match (or activate the rightmost chip)' },
      { keys: ['⌘', '⇧', 'G'], desc: 'Previous match' },
      { keys: ['⌘', 'K'], desc: 'Clear the log buffer' },
      { keys: ['Tab'], desc: '(In filter input) accept the highlighted suggestion' },
      { keys: ['Enter'], desc: '(In filter input) commit the chip' },
      { keys: ['Backspace'], desc: '(In filter input, empty) delete the last chip' },
      { keys: ['Click'], desc: '(On a chip) activate it for ⌘G match navigation' },
      { keys: ['Click'], desc: '(On a log row) select it as the active match' },
      { keys: ['Click'], desc: '(On a level pill) toggle that level' },
      { keys: ['Double-click'], desc: '(On a level pill) solo that level' },
      { keys: ['Click'], desc: '(On a heatmap cell) jump to that second in the log' },
    ],
  },
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
  return createPortal(
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
          {GROUPS.map((g) => (
            <div key={g.title} className="help-group">
              <h3 className="help-group-title">{g.title}</h3>
              <table className="help-table">
                <tbody>
                  {g.shortcuts.map((s, i) => (
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
          ))}
        </div>
      </div>
    </>,
    document.body,
  );
}
