import { describe, expect, it } from 'vitest';
import { runFunctionSim, substEnv } from './sim';

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
});
