import { describe, expect, it } from 'vitest';
import { formatTs } from './format';

// A fixed local-time instant: 2024-05-25 20:41:09.261. Built from local
// components so the assertions hold regardless of the runner's timezone
// (the formatter reads local getHours/getMonth/etc., matching the UI).
const TS = new Date(2024, 4, 25, 20, 41, 9, 261).getTime();

describe('formatTs', () => {
  it('defaults to the full date + time + millis shape', () => {
    expect(formatTs(TS)).toBe('05-25 20:41:09.261');
  });

  it('"datetime" matches the default', () => {
    expect(formatTs(TS, 'datetime')).toBe('05-25 20:41:09.261');
  });

  it('"time" drops the date but keeps milliseconds', () => {
    expect(formatTs(TS, 'time')).toBe('20:41:09.261');
  });

  it('"clock" drops the date and the milliseconds', () => {
    expect(formatTs(TS, 'clock')).toBe('20:41:09');
  });

  it('zero-pads every component', () => {
    const early = new Date(2024, 0, 3, 4, 5, 6, 7).getTime();
    expect(formatTs(early, 'datetime')).toBe('01-03 04:05:06.007');
    expect(formatTs(early, 'time')).toBe('04:05:06.007');
    expect(formatTs(early, 'clock')).toBe('04:05:06');
  });
});
