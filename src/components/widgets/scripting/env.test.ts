import { describe, expect, it } from 'vitest';
import { envFromControls, stringifyValue } from './env';
import type { ControlConfig } from './scriptingSettings';

describe('stringifyValue', () => {
  it('maps booleans to 1/0', () => {
    expect(stringifyValue(true)).toBe('1');
    expect(stringifyValue(false)).toBe('0');
  });
  it('stringifies numbers and passes strings through', () => {
    expect(stringifyValue(42)).toBe('42');
    expect(stringifyValue('com.example')).toBe('com.example');
  });
  it('blanks nullish', () => {
    expect(stringifyValue(undefined)).toBe('');
  });
});

const text = (id: string, label: string, dv: string): ControlConfig => ({
  id,
  kind: 'text',
  label,
  defaultValue: dv,
  onChange: 'none',
});
const toggle = (id: string, label: string): ControlConfig => ({
  id,
  kind: 'toggle',
  label,
  defaultValue: false,
  onChange: 'refresh',
});
const button = (id: string): ControlConfig => ({
  id,
  kind: 'button',
  label: 'Go',
  variant: 'default',
  confirm: false,
  bindOutputTo: 'console',
});

describe('envFromControls', () => {
  it('derives env names from labels and uses current values', () => {
    const controls = [text('a', 'Package name', 'x'), toggle('b', 'Verbose')];
    const env = envFromControls(controls, { a: 'com.foo', b: true });
    expect(env).toEqual({ PACKAGE_NAME: 'com.foo', VERBOSE: '1' });
  });

  it('falls back to the default value when no runtime value is set', () => {
    const env = envFromControls([text('a', 'Pkg', 'def')], {});
    expect(env.PKG).toBe('def');
  });

  it('excludes non-input controls', () => {
    const env = envFromControls([button('btn')], {});
    expect(env).toEqual({});
  });

  it('maps a toggle to its custom off/on values when set', () => {
    const tg: ControlConfig = {
      id: 't',
      kind: 'toggle',
      label: 'Mode',
      defaultValue: false,
      onChange: 'none',
      values: ['stop', 'start'],
    };
    expect(envFromControls([tg], { t: false })).toEqual({ MODE: 'stop' });
    expect(envFromControls([tg], { t: true })).toEqual({ MODE: 'start' });
  });

  it('falls back to 1/0 for a missing custom value and an empty values list', () => {
    const onlyOff: ControlConfig = {
      id: 't',
      kind: 'toggle',
      label: 'Flag',
      defaultValue: false,
      onChange: 'none',
      values: ['off'],
    };
    expect(envFromControls([onlyOff], { t: true }).FLAG).toBe('1');
    const empty: ControlConfig = { ...onlyOff, values: [] };
    expect(envFromControls([empty], { t: true }).FLAG).toBe('1');
    expect(envFromControls([empty], { t: false }).FLAG).toBe('0');
  });

  it('keeps an empty-string off value rather than defaulting it', () => {
    const tg: ControlConfig = {
      id: 't',
      kind: 'toggle',
      label: 'Verbose',
      defaultValue: false,
      onChange: 'none',
      values: ['', 'yes'],
    };
    expect(envFromControls([tg], { t: false })).toEqual({ VERBOSE: '' });
    expect(envFromControls([tg], { t: true })).toEqual({ VERBOSE: 'yes' });
  });
});
