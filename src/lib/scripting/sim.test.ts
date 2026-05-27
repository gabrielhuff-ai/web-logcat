import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { interpretEscapes, runFunctionSim, streamFunctionSim, substEnv } from './sim';

describe('substEnv', () => {
  it('substitutes $NAME and ${NAME}', () => {
    expect(substEnv('hi $NAME and ${OTHER}', { NAME: 'a', OTHER: 'b' })).toBe('hi a and b');
  });
  it('blanks unknown vars', () => {
    expect(substEnv('x$MISSING y', {})).toBe('x y');
  });
});

const SCRIPT = `greet() {
  echo "hello $NAME"
}
quiet() {
  : noop
}`;

describe('runFunctionSim', () => {
  it('emits echoed output with env substitution', () => {
    const r = runFunctionSim(SCRIPT, 'greet', { NAME: 'world' });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe('hello world');
  });

  it('treats single-quoted args as literal', () => {
    const r = runFunctionSim(`f() {\n  echo '$NAME stays literal'\n}`, 'f', { NAME: 'x' });
    expect(r.stdout).toBe('$NAME stays literal');
  });

  it('simulates inline one-liner functions', () => {
    expect(runFunctionSim('temp() { echo 31.2; }', 'temp', {}).stdout).toBe('31.2');
  });

  it('simulates multiple inline echoes separated by semicolons', () => {
    expect(runFunctionSim('f() { echo a; echo b; }', 'f', {}).stdout).toBe('a\nb');
  });

  it('reports 127 for an unknown function', () => {
    const r = runFunctionSim(SCRIPT, 'missing', {});
    expect(r.exitCode).toBe(127);
    expect(r.stderr).toContain('not found');
  });

  it('gives a placeholder when the function has no echo output', () => {
    const r = runFunctionSim(SCRIPT, 'quiet', {});
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('[sim]');
  });

  it('interprets echo -e escapes (ANSI + newline) and splits lines', () => {
    const r = runFunctionSim('f() { echo -e "\\e[31mred\\nplain"; }', 'f', {});
    expect(r.stdout).toBe('\x1b[31mred\nplain');
  });

  it('leaves backslash escapes literal without -e', () => {
    const r = runFunctionSim('f() { echo "\\e[31mraw"; }', 'f', {});
    expect(r.stdout).toBe('\\e[31mraw');
  });
});

describe('interpretEscapes', () => {
  it('expands \\e, \\033, \\x1b to ESC and \\n / \\t', () => {
    expect(interpretEscapes('\\e[0m')).toBe('\x1b[0m');
    expect(interpretEscapes('\\033[0m')).toBe('\x1b[0m');
    expect(interpretEscapes('\\x1b[0m')).toBe('\x1b[0m');
    expect(interpretEscapes('a\\nb\\tc')).toBe('a\nb\tc');
  });
});

describe('streamFunctionSim', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('emits the first line immediately, then more on the interval, and loops', () => {
    const lines: string[] = [];
    const handle = streamFunctionSim('f() { echo a; echo b; }', 'f', {}, {
      onLine: (t) => lines.push(t),
    });
    expect(lines).toEqual(['a']); // first line is prompt-immediate
    vi.advanceTimersByTime(700);
    vi.advanceTimersByTime(700);
    expect(lines).toEqual(['a', 'b', 'a']); // looped back to the first line
    handle.stop();
    vi.advanceTimersByTime(2100);
    expect(lines).toEqual(['a', 'b', 'a']); // stop() halts emission
  });

  it('finishes (no looping) with the code when the function calls exit', () => {
    const lines: string[] = [];
    let exit = -1;
    const h = streamFunctionSim('f() { echo done; exit 0; }', 'f', {}, {
      onLine: (t) => lines.push(t),
      onExit: (c) => (exit = c),
    });
    expect(lines).toEqual(['done']);
    expect(exit).toBe(0);
    vi.advanceTimersByTime(2100);
    expect(lines).toEqual(['done']); // did not loop after exiting
    h.stop();
  });

  it('reports the explicit non-zero exit code', () => {
    let exit = -1;
    streamFunctionSim('f() { echo oops; exit 3; }', 'f', {}, {
      onLine: () => {},
      onExit: (c) => (exit = c),
    });
    expect(exit).toBe(3);
  });

  it('reports an unknown function as an error line and exits 127', () => {
    const lines: { t: string; k: string }[] = [];
    let exit = -1;
    streamFunctionSim('f() { :; }', 'missing', {}, {
      onLine: (t, k) => lines.push({ t, k }),
      onExit: (c) => (exit = c),
    });
    expect(exit).toBe(127);
    expect(lines[0].k).toBe('err');
    expect(lines[0].t).toContain('not found');
  });
});
