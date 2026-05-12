import { describe, expect, it } from 'vitest';
import {
  markInternalDropConsumed,
  resetInternalDropConsumed,
  takeInternalDropConsumed,
} from './dragHandoff';

describe('dragHandoff', () => {
  it('defaults to not-consumed', () => {
    resetInternalDropConsumed();
    expect(takeInternalDropConsumed()).toBe(false);
  });

  it('reports consumption set by markInternalDropConsumed', () => {
    resetInternalDropConsumed();
    markInternalDropConsumed();
    expect(takeInternalDropConsumed()).toBe(true);
  });

  it('clears the flag after read so the next drag starts clean', () => {
    markInternalDropConsumed();
    expect(takeInternalDropConsumed()).toBe(true);
    expect(takeInternalDropConsumed()).toBe(false);
  });

  it('resetInternalDropConsumed discards a pending flag', () => {
    markInternalDropConsumed();
    resetInternalDropConsumed();
    expect(takeInternalDropConsumed()).toBe(false);
  });
});
