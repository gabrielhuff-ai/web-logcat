import { describe, expect, it } from 'vitest';
import { shouldRestart } from './daemonRestart';

describe('shouldRestart', () => {
  it("never restarts under the default 'no' policy", () => {
    expect(shouldRestart('no', 0)).toBe(false);
    expect(shouldRestart('no', 1)).toBe(false);
    expect(shouldRestart(undefined, 0)).toBe(false);
    expect(shouldRestart(undefined, 1)).toBe(false);
  });

  it("'on-failure' restarts only on a non-zero exit", () => {
    expect(shouldRestart('on-failure', 1)).toBe(true);
    expect(shouldRestart('on-failure', 137)).toBe(true);
    expect(shouldRestart('on-failure', 0)).toBe(false);
  });

  it("'on-success' restarts only on a clean exit", () => {
    expect(shouldRestart('on-success', 0)).toBe(true);
    expect(shouldRestart('on-success', 1)).toBe(false);
  });

  it("'always' restarts on either", () => {
    expect(shouldRestart('always', 0)).toBe(true);
    expect(shouldRestart('always', 2)).toBe(true);
  });
});
