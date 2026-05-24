import { describe, expect, it } from 'vitest';
import { isBoundDisplay, parseDisplayValue } from './displayParse';
import type { ControlConfig } from './scriptingSettings';

const ok = (stdout: string) => ({ stdout, stderr: '', exitCode: 0 });
const fail = (stderr: string) => ({ stdout: '', stderr, exitCode: 1 });

describe('isBoundDisplay', () => {
  it('matches display kinds only', () => {
    const readout: ControlConfig = {
      id: 'r',
      kind: 'readout',
      label: 'R',
      boundTo: 'f',
      autoPoll: { enabled: false, intervalSec: 2 },
      refreshOnChange: false,
    };
    const text: ControlConfig = { id: 't', kind: 'text', label: 'T', defaultValue: '', onChange: 'none' };
    expect(isBoundDisplay(readout)).toBe(true);
    expect(isBoundDisplay(text)).toBe(false);
  });
});

describe('parseDisplayValue', () => {
  it('extracts a number from the last stdout line for readouts', () => {
    const v = parseDisplayValue('readout', ok('noise\n31.2'));
    expect(v.number).toBeCloseTo(31.2);
    expect(v.text).toBe('31.2');
    expect(v.state).toBe('ok');
  });

  it('shows the last line as status text', () => {
    expect(parseDisplayValue('status', ok('CONNECTED')).text).toBe('CONNECTED');
  });

  it('maps LED words and truthiness to colours', () => {
    expect(parseDisplayValue('led', ok('green')).ledColor).toBe('green');
    expect(parseDisplayValue('led', ok('0')).ledColor).toBe('off');
    expect(parseDisplayValue('led', ok('1')).ledColor).toBe('green');
  });

  it('enters the error state on a non-zero exit', () => {
    const v = parseDisplayValue('readout', fail('boom'));
    expect(v.state).toBe('err');
    expect(v.text).toBe('boom');
    expect(parseDisplayValue('led', fail('x')).ledColor).toBe('red');
  });
});
