import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseWifi } from './wifi';

const FIXTURE = readFileSync(
  resolve(__dirname, '../__fixtures__/wifi.txt'),
  'utf8',
);

describe('parseWifi', () => {
  it('decodes the captured fixture', () => {
    const out = parseWifi(FIXTURE);
    expect(out.enabled).toBe(true);
    expect(out.ssid).toBe('HomeWifi-5G');
    expect(out.rssiDbm).toBe(-52);
    expect(out.linkSpeedMbps).toBe(866);
    expect(out.freqMhz).toBe(5180);
    expect(out.ipAddress).toBe('192.168.1.142');
    expect(out.macAddress).toBe('04:42:1a:**');
  });

  it('decodes the scan results table', () => {
    const out = parseWifi(FIXTURE);
    expect(out.scan).toHaveLength(5);
    expect(out.scan[0]).toEqual({
      bssid: '04:42:1a:11:22:33',
      ssid: 'HomeWifi-5G',
      freqMhz: 5180,
      rssiDbm: -52,
      capabilities: '[WPA2-PSK-CCMP][ESS]',
    });
  });

  it('handles a disabled / disconnected dump', () => {
    const out = parseWifi('Wi-Fi is disabled\n');
    expect(out.enabled).toBe(false);
    expect(out.ssid).toBeNull();
    expect(out.scan).toHaveLength(0);
  });
});
