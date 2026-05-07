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
 * Parse `dumpsys wifi` output. The format differs noticeably between
 * the legacy fixture-style dump (`ConnectedSSID:`, `RSSI: -52 dBm`,
 * `LinkSpeed: 866 Mbps`, `MacAddress: ...`) and the comma-separated
 * `mWifiInfo` line emitted by Android 13+ (`SSID: "...", RSSI: -52,
 * Link speed: 866Mbps, MAC: ...`). Each field falls back to whichever
 * variant is present, so a single parser handles both.
 *
 * Tolerant of devices that strip parts of the dump (Android 11+
 * randomises MAC by default; some vendors omit BSSID/freq from the
 * scan table).
 */
export function parseWifi(raw: string): WifiParsed {
  const enabled = /Wi-?Fi is enabled/i.test(raw);

  // SSID: legacy `ConnectedSSID:` or modern `SSID: "..."` (inside the
  // comma-separated mWifiInfo line). The "<unknown ssid>" sentinel is
  // suppressed to null since it doesn't carry information.
  let ssid: string | null = null;
  const ssidMatch =
    /ConnectedSSID:\s*"?([^",\n]+?)"?\s*$/m.exec(raw) ??
    /\bSSID:\s*"([^"\n]*)"/i.exec(raw);
  if (ssidMatch) {
    const v = ssidMatch[1].trim();
    if (v && v !== '<unknown ssid>') ssid = v;
  }

  // RSSI: legacy ends with `dBm`; modern is bare in the comma list.
  const rssiMatch =
    /RSSI:\s*(-?\d+)\s*dBm/i.exec(raw) ??
    /RSSI:\s*(-?\d+)\b/.exec(raw);
  const rssiDbm = rssiMatch ? Number(rssiMatch[1]) : null;

  // Link speed: legacy `LinkSpeed:`; modern `Link speed:` (note
  // capitalisation + space). The unit may have a space before Mbps or
  // be glued (`866Mbps`).
  const speedMatch =
    /Link\s*[Ss]peed:\s*(\d+)\s*Mbps/i.exec(raw);
  const linkSpeedMbps = speedMatch ? Number(speedMatch[1]) : null;

  // Frequency: `Frequency: 5180 MHz` or `5180MHz` — `\s*` allows both.
  const freqMatch = /Frequency:\s*(\d+)\s*MHz/i.exec(raw);
  const freqMhz = freqMatch ? Number(freqMatch[1]) : null;

  // IP address: legacy `IpAddress:`; modern devices typically print
  // it inside the IpClient block as `inet 192.168.x.x` against the
  // wlan interface. Try both.
  const ipMatch =
    /IpAddress:\s*([\d.]+)/.exec(raw) ??
    /\binet\s+([\d.]+)\b(?!.*\bscope\s+host)/.exec(raw);
  const ipAddress = ipMatch ? ipMatch[1] : null;

  // MAC address: `MacAddress:` (legacy) or `MAC:` (modern, in the
  // mWifiInfo line). Accept hex octets and `*` for randomised dumps.
  const macMatch =
    /MacAddress:\s*([0-9a-fA-F:*]+)/.exec(raw) ??
    /\bMAC:\s*([0-9a-fA-F:*]{8,})/.exec(raw);
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
