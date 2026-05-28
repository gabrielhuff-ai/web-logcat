import { describe, expect, it } from 'vitest';
import { applyShiftTab, applyTab, toggleComment } from './editorKeys';

describe('applyTab', () => {
  it('inserts two spaces at a collapsed cursor', () => {
    const r = applyTab('echo hi', 0, 0);
    expect(r.value).toBe('  echo hi');
    expect([r.selectionStart, r.selectionEnd]).toEqual([2, 2]);
  });

  it('indents every line of a multi-line selection', () => {
    const v = 'a\nb\nc';
    const r = applyTab(v, 0, v.length); // select all
    expect(r.value).toBe('  a\n  b\n  c');
    // end shifts by 2 per line (3 lines).
    expect(r.selectionEnd).toBe(v.length + 6);
  });
});

describe('applyShiftTab', () => {
  it('removes up to two leading spaces from each selected line', () => {
    const v = '  a\n    b';
    const r = applyShiftTab(v, 0, v.length);
    expect(r.value).toBe('a\n  b'); // first line -2, second -2
  });

  it('is a no-op on a line with no leading indent', () => {
    expect(applyShiftTab('abc', 1, 1).value).toBe('abc');
  });
});

describe('toggleComment', () => {
  it('comments an uncommented line, preserving indentation', () => {
    expect(toggleComment('  echo hi', 0, 0).value).toBe('  # echo hi');
  });

  it('uncomments a commented line', () => {
    expect(toggleComment('# echo hi', 0, 0).value).toBe('echo hi');
    expect(toggleComment('  #echo', 0, 0).value).toBe('  echo');
  });

  it('comments a block when any line is uncommented', () => {
    const v = '# a\nb';
    expect(toggleComment(v, 0, v.length).value).toBe('# # a\n# b');
  });

  it('uncomments a block only when every non-blank line is commented', () => {
    const v = '# a\n\n#  b';
    const r = toggleComment(v, 0, v.length);
    expect(r.value).toBe('a\n\n b'); // blank line untouched; one space kept from "#  b"
  });

  it('leaves blank lines alone', () => {
    expect(toggleComment('\n', 0, 1).value).toBe('\n');
  });
});
