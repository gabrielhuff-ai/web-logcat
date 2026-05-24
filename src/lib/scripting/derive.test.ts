import { describe, expect, it } from 'vitest';
import { fnFromLabel, slug, varFromLabel, varNameFromLabel } from './derive';

describe('slug', () => {
  it('uppercases and snake-cases a simple label', () => {
    expect(slug('Brightness')).toBe('BRIGHTNESS');
    expect(slug('Force stop')).toBe('FORCE_STOP');
  });

  it('collapses runs of non-alphanumerics to a single underscore', () => {
    expect(slug('Battery   temperature')).toBe('BATTERY_TEMPERATURE');
    expect(slug('Wi-Fi / state')).toBe('WI_FI_STATE');
    expect(slug('anim.scale (x)')).toBe('ANIM_SCALE_X');
  });

  it('trims leading and trailing underscores', () => {
    expect(slug('  spaced  ')).toBe('SPACED');
    expect(slug('--dashes--')).toBe('DASHES');
    expect(slug('!leading')).toBe('LEADING');
  });

  it('never emits hyphens (mksh function names forbid them)', () => {
    expect(slug('set-brightness')).not.toContain('-');
    expect(slug('set-brightness')).toBe('SET_BRIGHTNESS');
  });

  it('falls back to UNNAMED for empty or all-symbol labels', () => {
    expect(slug('')).toBe('UNNAMED');
    expect(slug('   ')).toBe('UNNAMED');
    expect(slug('!!!')).toBe('UNNAMED');
  });

  it('keeps digits but is still a valid identifier stem', () => {
    expect(slug('User 0')).toBe('USER_0');
  });
});

describe('fnFromLabel', () => {
  it('lowercases the slug', () => {
    expect(fnFromLabel('Force stop')).toBe('force_stop');
    expect(fnFromLabel('Battery temperature')).toBe('battery_temperature');
  });
});

describe('varNameFromLabel / varFromLabel', () => {
  it('produces a bare env var name', () => {
    expect(varNameFromLabel('Package name')).toBe('PACKAGE_NAME');
  });

  it('prefixes the reference form with $', () => {
    expect(varFromLabel('Brightness')).toBe('$BRIGHTNESS');
  });
});
