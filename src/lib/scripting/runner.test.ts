import { describe, expect, it } from 'vitest';
import { buildCommand, shQuote } from './runner';

describe('shQuote', () => {
  it('single-quotes plain values', () => {
    expect(shQuote('com.example')).toBe(`'com.example'`);
  });
  it('escapes embedded single quotes', () => {
    expect(shQuote("a'b")).toBe(`'a'\\''b'`);
  });
});

describe('buildCommand', () => {
  it('assigns inputs, includes the script, and calls the function last', () => {
    const cmd = buildCommand({
      script: 'f() { echo hi; }',
      fn: 'f',
      env: { PKG: 'com.example' },
      runAsRoot: false,
    });
    expect(cmd).toBe(`PKG='com.example'\nf() { echo hi; }\nf`);
  });

  it('keeps dangerous values inside single quotes (injection-safe)', () => {
    const cmd = buildCommand({
      script: 's',
      fn: 'f',
      env: { PKG: '; rm -rf / #' },
      runAsRoot: false,
    });
    // The metacharacters live inside a single-quoted literal, not as code.
    expect(cmd).toContain(`PKG='; rm -rf / #'`);
  });

  it('escapes a value containing a single quote', () => {
    const cmd = buildCommand({ script: 's', fn: 'f', env: { X: "a'b" }, runAsRoot: false });
    expect(cmd).toContain(`X='a'\\''b'`);
  });

  it('works with no inputs', () => {
    expect(buildCommand({ script: 'f() { :; }', fn: 'f', env: {}, runAsRoot: false })).toBe(
      'f() { :; }\nf',
    );
  });

  it('wraps the whole command in su -c when running as root', () => {
    const cmd = buildCommand({ script: 's', fn: 'f', env: {}, runAsRoot: true });
    expect(cmd.startsWith('su -c ')).toBe(true);
    // The body is a single quoted argument to su.
    expect(cmd).toBe(`su -c ${shQuote('s\nf')}`);
  });
});
