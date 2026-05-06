import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBattery } from './battery';

const FIXTURE = readFileSync(
  resolve(__dirname, '../__fixtures__/battery.txt'),
  'utf8',
);

describe('parseBattery', () => {
  it('decodes the captured Pixel-style fixture', () => {
    const out = parseBattery(FIXTURE);
    expect(out.levelRaw).toBe(78);
    expect(out.scale).toBe(100);
    expect(out.level).toBeCloseTo(0.78, 5);
    expect(out.tempC).toBeCloseTo(31.2, 5);
    expect(out.voltageV).toBeCloseTo(4.18, 5);
    expect(out.status).toBe('charging');
    expect(out.health).toBe('good');
    expect(out.technology).toBe('Li-ion');
    expect(out.powered).toEqual({ ac: false, usb: true, wireless: false });
    expect(out.chargeRemainMin).toBe(45);
  });

  it('returns null fields for missing keys', () => {
    const out = parseBattery('Current Battery Service state:\n  level: 50\n');
    expect(out.levelRaw).toBe(50);
    expect(out.tempC).toBeNull();
    expect(out.voltageV).toBeNull();
    expect(out.currentMa).toBeNull();
    expect(out.health).toBe('unknown');
  });

  it('treats unknown status / health codes as unknown', () => {
    const out = parseBattery('  status: 99\n  health: 42\n');
    expect(out.status).toBe('unknown');
    expect(out.health).toBe('unknown');
  });
});
