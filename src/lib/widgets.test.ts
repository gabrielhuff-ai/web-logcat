import { describe, expect, it } from 'vitest';
import { WIDGETS, WIDGET_KINDS } from './widgets';
import type { WidgetKind } from '../types';

describe('widgets registry', () => {
  it('covers every WidgetKind in the union', () => {
    const expected: WidgetKind[] = ['logcat', 'shell', 'dumpsys', 'files', 'mirror'];
    for (const k of expected) {
      expect(WIDGETS[k]).toBeDefined();
    }
    expect(WIDGET_KINDS).toEqual(expected);
  });

  it('has Logcat + Shell + Files enabled and the rest disabled in Phase 8', () => {
    expect(WIDGETS.logcat.enabled).toBe(true);
    expect(WIDGETS.shell.enabled).toBe(true);
    expect(WIDGETS.files.enabled).toBe(true);
    expect(WIDGETS.dumpsys.enabled).toBe(false);
    expect(WIDGETS.mirror.enabled).toBe(false);
  });

  it('hard-caps Mirror at 1 instance', () => {
    expect(WIDGETS.mirror.maxInstances).toBe(1);
    // The other kinds intentionally have no cap.
    expect(WIDGETS.logcat.maxInstances).toBeUndefined();
    expect(WIDGETS.shell.maxInstances).toBeUndefined();
  });

  it('every entry has a sane default size (≥ 2 cells in each axis)', () => {
    for (const k of WIDGET_KINDS) {
      const def = WIDGETS[k];
      expect(def.defaultSize.w).toBeGreaterThanOrEqual(2);
      expect(def.defaultSize.h).toBeGreaterThanOrEqual(2);
      expect(def.defaultSize.w).toBeLessThanOrEqual(12);
    }
  });

  it('every entry has a non-empty name + description + icon + comp', () => {
    for (const k of WIDGET_KINDS) {
      const def = WIDGETS[k];
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.desc.length).toBeGreaterThan(0);
      expect(def.icon).toBeTypeOf('function');
      expect(def.comp).toBeTypeOf('function');
    }
  });
});
