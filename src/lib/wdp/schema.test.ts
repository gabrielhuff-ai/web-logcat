import { describe, expect, it } from 'vitest';
import { parseTrackDevicesResponse, wdpDeviceReady, wdpDeviceStatus } from './schema';

describe('parseTrackDevicesResponse', () => {
  it('accepts the empty initial snapshot', () => {
    const r = parseTrackDevicesResponse({ device: [], version: 'wdp-1.2' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.device).toEqual([]);
      expect(r.value.version).toBe('wdp-1.2');
    }
  });

  it('accepts an ADB-ready device with adbProps', () => {
    const r = parseTrackDevicesResponse({
      device: [
        {
          serialNumber: 'serial-abc',
          proxyStatus: 'ADB',
          adbStatus: 'DEVICE',
          adbProps: { 'ro.product.model': 'Pixel 7' },
        },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.value.device?.[0].proxyStatus === 'ADB') {
      expect(r.value.device[0].adbProps?.['ro.product.model']).toBe('Pixel 7');
    }
  });

  it('accepts a PROXY_UNAUTHORIZED device', () => {
    const r = parseTrackDevicesResponse({
      device: [
        {
          serialNumber: 'serial-xyz',
          proxyStatus: 'PROXY_UNAUTHORIZED',
          adbStatus: 'AUTHORIZING',
          approveUrl: 'https://example.com/approve',
        },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.value.device?.[0].proxyStatus === 'PROXY_UNAUTHORIZED') {
      expect(r.value.device[0].approveUrl).toBe('https://example.com/approve');
    }
  });

  it('surfaces ORIGIN_NOT_ALLOWLISTED with the approveUrl', () => {
    const r = parseTrackDevicesResponse({
      error: {
        type: 'ORIGIN_NOT_ALLOWLISTED',
        message: 'Origin must be allowlisted',
        approveUrl: 'https://example.com/approve',
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.error?.type).toBe('ORIGIN_NOT_ALLOWLISTED');
      expect(r.value.error?.approveUrl).toBe('https://example.com/approve');
    }
  });

  it('rejects unknown proxyStatus values', () => {
    const r = parseTrackDevicesResponse({
      device: [{ serialNumber: 'x', proxyStatus: 'BANANA', adbStatus: 'DEVICE' }],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects an ADB device missing adbStatus', () => {
    const r = parseTrackDevicesResponse({
      device: [{ serialNumber: 'x', proxyStatus: 'ADB' }],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects a non-object payload', () => {
    const r = parseTrackDevicesResponse('hello');
    expect(r.ok).toBe(false);
  });
});

describe('wdpDeviceReady / wdpDeviceStatus', () => {
  it('treats ADB+DEVICE as ready', () => {
    expect(
      wdpDeviceReady({ serialNumber: 'x', proxyStatus: 'ADB', adbStatus: 'DEVICE' }),
    ).toBe(true);
  });
  it('treats ADB+OFFLINE as not ready', () => {
    expect(
      wdpDeviceReady({ serialNumber: 'x', proxyStatus: 'ADB', adbStatus: 'OFFLINE' }),
    ).toBe(false);
  });
  it('treats PROXY_UNAUTHORIZED as not ready', () => {
    expect(
      wdpDeviceReady({
        serialNumber: 'x',
        proxyStatus: 'PROXY_UNAUTHORIZED',
        adbStatus: 'AUTHORIZING',
        approveUrl: 'u',
      }),
    ).toBe(false);
  });
  it('returns adbStatus for ADB and proxyStatus otherwise', () => {
    expect(
      wdpDeviceStatus({ serialNumber: 'x', proxyStatus: 'ADB', adbStatus: 'DEVICE' }),
    ).toBe('DEVICE');
    expect(
      wdpDeviceStatus({
        serialNumber: 'x',
        proxyStatus: 'PROXY_UNAUTHORIZED',
        adbStatus: 'AUTHORIZING',
        approveUrl: 'u',
      }),
    ).toBe('PROXY_UNAUTHORIZED');
  });
});
