// Wi-Fi preset card grid.
//
// Cards: connected network details + scan results table.

import type { WifiParsed } from '../../../lib/dumpsys/parsers/wifi';

export function WifiCard({ data }: { data: WifiParsed }) {
  if (!data.enabled) {
    return (
      <div className="ds-card">
        <div className="ds-card-head">Wi-Fi</div>
        <div className="ds-empty">Wi-Fi is disabled on this device.</div>
      </div>
    );
  }

  const bandLabel =
    data.freqMhz != null
      ? data.freqMhz >= 5000
        ? '5 GHz'
        : data.freqMhz >= 2400
          ? '2.4 GHz'
          : `${data.freqMhz} MHz`
      : '—';

  return (
    <>
      <div className="ds-card">
        <div className="ds-card-head">Connected network</div>
        <Row k="SSID" v={data.ssid ?? '—'} />
        <Row
          k="Signal"
          v={data.rssiDbm != null ? `${data.rssiDbm} dBm` : '—'}
        />
        <Row
          k="Link speed"
          v={data.linkSpeedMbps != null ? `${data.linkSpeedMbps} Mbps` : '—'}
        />
        <Row
          k="Frequency"
          v={
            data.freqMhz != null
              ? `${data.freqMhz} MHz · ${bandLabel}`
              : bandLabel
          }
        />
        <Row k="IP" v={data.ipAddress ?? '—'} />
        {data.macAddress && <Row k="MAC" v={data.macAddress} />}
      </div>

      {data.scan.length > 0 && (
        <div className="ds-card">
          <div className="ds-card-head">Scan results · {data.scan.length}</div>
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead>
                <tr>
                  <th>SSID</th>
                  <th>BSSID</th>
                  <th>Freq</th>
                  <th>RSSI</th>
                  <th>Cap</th>
                </tr>
              </thead>
              <tbody>
                {data.scan.map((s, i) => (
                  <tr key={`${s.bssid}-${i}`}>
                    <td>{s.ssid}</td>
                    <td className="mono">{s.bssid}</td>
                    <td>{s.freqMhz}</td>
                    <td>{s.rssiDbm}</td>
                    <td className="mono small">{s.capabilities}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="ds-card-row">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}
