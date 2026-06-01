import { describe, expect, it } from 'vitest';
import { categoryOf, groupControls, hiddenByCollapse } from './panelLayout';
import type { ControlConfig } from './scriptingSettings';

const input = (id: string): ControlConfig => ({
  id,
  kind: 'text',
  label: id,
  defaultValue: '',
  onChange: 'none',
});
const button = (id: string): ControlConfig => ({
  id,
  kind: 'button',
  label: id,
  variant: 'default',
  confirm: false,
  bindOutputTo: 'console',
});
const readout = (id: string): ControlConfig => ({
  id,
  kind: 'readout',
  label: id,
  boundTo: 'fn',
  autoPoll: { enabled: false, intervalSec: 2 },
  refreshOnChange: false,
});
const daemon = (id: string): ControlConfig => ({
  id,
  kind: 'daemon',
  label: id,
  bindOutputTo: 'console',
});
const section = (id: string, collapsed?: boolean, collapsible?: boolean): ControlConfig => ({
  id,
  kind: 'section',
  title: id,
  ...(collapsed != null ? { collapsed } : {}),
  ...(collapsible != null ? { collapsible } : {}),
});
const consoleCtl = (id: string): ControlConfig => ({
  id,
  kind: 'console',
  label: id,
  scope: 'recent',
  copyButton: true,
  autoScroll: true,
});

describe('categoryOf', () => {
  it('maps each kind to its band', () => {
    expect(categoryOf(input('a'))).toBe('inputs');
    expect(categoryOf(button('a'))).toBe('buttons');
    expect(categoryOf(daemon('a'))).toBe('buttons');
    expect(categoryOf(readout('a'))).toBe('displays');
    expect(categoryOf(section('a'))).toBe('section');
    expect(categoryOf(consoleCtl('a'))).toBe('console');
  });

  it('groups a daemon alongside buttons in the button rail', () => {
    const groups = groupControls([button('a'), daemon('b')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].category).toBe('buttons');
    expect(groups[0].items.map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('groupControls', () => {
  it('returns no groups for an empty list', () => {
    expect(groupControls([])).toEqual([]);
  });

  it('merges consecutive inputs into a single band', () => {
    const groups = groupControls([input('a'), input('b'), input('c')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].category).toBe('inputs');
    expect(groups[0].items.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('splits bands at a category change', () => {
    const groups = groupControls([input('a'), button('b'), readout('c')]);
    expect(groups.map((g) => g.category)).toEqual(['inputs', 'buttons', 'displays']);
  });

  it('keeps sections and consoles as singletons that break runs', () => {
    const groups = groupControls([
      input('a'),
      section('s'),
      input('b'),
      consoleCtl('out'),
    ]);
    expect(groups.map((g) => g.category)).toEqual(['inputs', 'section', 'inputs', 'console']);
    expect(groups.every((g) => g.items.length === 1)).toBe(true);
  });

  it('does not merge two consecutive consoles', () => {
    const groups = groupControls([consoleCtl('a'), consoleCtl('b')]);
    expect(groups).toHaveLength(2);
  });
});

describe('hiddenByCollapse', () => {
  it('hides nothing when no section is collapsed', () => {
    const hidden = hiddenByCollapse([section('s'), input('a'), button('b')]);
    expect(hidden.size).toBe(0);
  });

  it('hides controls under a collapsed section up to the next section', () => {
    const hidden = hiddenByCollapse([
      section('s1', true),
      input('a'),
      button('b'),
      section('s2'),
      input('c'),
    ]);
    expect([...hidden]).toEqual(['a', 'b']);
  });

  it('never hides the section headings themselves', () => {
    const hidden = hiddenByCollapse([section('s1', true), section('s2', true)]);
    expect(hidden.size).toBe(0);
  });

  it('always shows controls that precede the first section', () => {
    const hidden = hiddenByCollapse([input('lead'), section('s1', true), input('a')]);
    expect(hidden.has('lead')).toBe(false);
    expect(hidden.has('a')).toBe(true);
  });

  it('re-expanding a later section reveals its run again', () => {
    const hidden = hiddenByCollapse([
      section('s1', true),
      input('a'),
      section('s2', false),
      input('b'),
    ]);
    expect(hidden.has('a')).toBe(true);
    expect(hidden.has('b')).toBe(false);
  });

  it('a non-collapsible section hides nothing even if marked collapsed', () => {
    // collapsed: true but collapsible: false → the flag is inert.
    const hidden = hiddenByCollapse([section('s1', true, false), input('a'), button('b')]);
    expect(hidden.size).toBe(0);
  });

  it('a collapsible section (explicit) still hides its run', () => {
    const hidden = hiddenByCollapse([section('s1', true, true), input('a')]);
    expect(hidden.has('a')).toBe(true);
  });
});
