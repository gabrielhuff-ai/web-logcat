// Parser for `dumpsys wifi` output.
//
// Captures the active connection (SSID / RSSI / link speed / freq / IP)
// and the latest scan-results table.

export interface WifiScanResult {
  bssid: string;
  ssid: string;
  /** Frequency in MHz. */
  freqMhz: number;
  rssiDbm: number;
  capabilities: string;
}

export interface WifiParsed {
  enabled: boolean;
  ssid: string | null;
  rssiDbm: number | null;
  linkSpeedMbps: number | null;
  freqMhz: number | null;
  ipAddress: string | null;
  macAddress: string | null;
  /** Scan results, in the order they appeared in the dump. */
  scan: WifiScanResult[];
}

/**
 * Parse `dumpsys wifi` output. Tolerant of devices that strip parts of
 * the dump (Android 11+ randomizes MAC by default; some vendors omit
 * BSSID/freq from the scan table).
 */
export function parseWifi(raw: string): WifiParsed {
  const enabled = /Wi-?Fi is enabled/i.test(raw);

  // Connected-network fields. ConnectedSSID is quoted; the others are bare.
  const ssidMatch = /ConnectedSSID:\s*"?([^"\n]+?)"?\s*$/m.exec(raw);
  const ssid = ssidMatch ? ssidMatch[1].trim() : null;

  const rssiMatch = /RSSI:\s*(-?\d+)\s*dBm/i.exec(raw);
  const rssiDbm = rssiMatch ? Number(rssiMatch[1]) : null;

  const speedMatch = /LinkSpeed:\s*(\d+)\s*Mbps/i.exec(raw);
  const linkSpeedMbps = speedMatch ? Number(speedMatch[1]) : null;

  const freqMatch = /Frequency:\s*(\d+)\s*MHz/i.exec(raw);
  const freqMhz = freqMatch ? Number(freqMatch[1]) : null;

  const ipMatch = /IpAddress:\s*([\d.]+)/.exec(raw);
  const ipAddress = ipMatch ? ipMatch[1] : null;

  const macMatch = /MacAddress:\s*([0-9a-fA-F:*]+)/.exec(raw);
  const macAddress = macMatch ? macMatch[1] : null;

  // Scan results table: lines after "Latest scan results:" header.
  const scan: WifiScanResult[] = [];
  const lines = raw.split(/\r?\n/);
  let inScan = false;
  for (const line of lines) {
    if (/Latest scan results:/i.test(line)) {
      inScan = true;
      continue;
    }
    if (!inScan) continue;
    if (/^\s*$/.test(line)) {
      // Blank line ends the scan section.
      if (scan.length > 0) break;
      continue;
    }
    // Skip the "BSSID  SSID  Freq  RSSI  Capabilities" header.
    if (/^\s*BSSID\b/i.test(line)) continue;
    // BSSID  SSID  Freq  RSSI  Capabilities
    // Whitespace is variable; SSID can contain whitespace inside but in
    // practice scan dumps split on \s+ cleanly. We split into 5 fields.
    const m = /^\s*([0-9a-fA-F:]{17})\s+(\S+)\s+(\d+)\s+(-?\d+)\s+(\S+)/.exec(
      line,
    );
    if (!m) continue;
    scan.push({
      bssid: m[1],
      ssid: m[2],
      freqMhz: Number(m[3]),
      rssiDbm: Number(m[4]),
      capabilities: m[5],
    });
  }

  return {
    enabled,
    ssid,
    rssiDbm,
    linkSpeedMbps,
    freqMhz,
    ipAddress,
    macAddress,
    scan,
  };
}
