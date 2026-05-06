// WebLogcat — Top toolbar (just brand, device picker, export, settings)

const Toolbar = ({ device, devices, onSwitchDevice, onDisconnect, onExport, onSettings, theme, setTheme }) => {
  const [pickerOpen, setPickerOpen] = React.useState(false);

  return (
    <div className="toolbar">
      <div className="tb-brand">
        <div className="tb-logo">
          <span className="tb-logo-square" />
          <span className="tb-logo-square s2" />
          <span className="tb-logo-square s3" />
        </div>
        <span className="tb-name">weblogcat</span>
      </div>

      <div className="divider" />

      <DevicePicker
        device={device}
        devices={devices}
        open={pickerOpen}
        setOpen={setPickerOpen}
        onSwitch={onSwitchDevice}
        onDisconnect={onDisconnect}
      />

      <div className="tb-spacer" />

      <button
        className="icon-btn tt"
        data-tt={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        {theme === "dark" ? <Icons.Sun size={15} /> : <Icons.Moon size={15} />}
      </button>
      <button className="icon-btn tt" data-tt="Save / export logs" onClick={onExport}>
        <Icons.Save />
      </button>
      <button className="icon-btn tt" data-tt="Settings" onClick={onSettings}>
        <Icons.Settings />
      </button>
    </div>
  );
};

const DevicePicker = ({ device, devices, open, setOpen, onSwitch, onDisconnect }) => {
  return (
    <div className="dp">
      <button className="dp-btn" onClick={() => setOpen(!open)}>
        <span className={"dp-status " + (device.status || "online")} />
        <span className="dp-info">
          <span className="dp-name">{device.model}</span>
          <span className="dp-meta">{device.serial} · Android {device.android}</span>
        </span>
        <Icons.Chevron size={13} />
      </button>
      {open && (
        <>
          <div className="overlay-catch" onClick={() => setOpen(false)} />
          <div className="dropdown">
            <div className="dd-section">Connected</div>
            {devices.map(d => (
              <button
                key={d.serial}
                className={"dd-item " + (d.serial === device.serial ? "current" : "")}
                onClick={() => { onSwitch(d); setOpen(false); }}
              >
                <span className={"dp-status " + (d.status || "online")} />
                <div className="dd-device">
                  <div>{d.model}</div>
                  <div className="dd-device-meta">{d.serial} · Android {d.android} · API {d.api}</div>
                </div>
                {d.serial === device.serial && <Icons.Check size={13} />}
              </button>
            ))}
            <div className="dd-sep" />
            <button className="dd-item">
              <Icons.Plus size={13} /> Pair new device…
            </button>
            <button className="dd-item" onClick={() => { onDisconnect(); setOpen(false); }}>
              <Icons.Close size={13} /> Disconnect all
            </button>
          </div>
        </>
      )}

      <style>{`
        .dp { position: relative; }
        .dp-btn {
          display: inline-flex; align-items: center; gap: 8px;
          height: 32px; padding: 0 10px;
          border-radius: var(--r-md);
          color: var(--fg-0);
          transition: background-color var(--dur-fast) var(--ease-out);
        }
        .dp-btn:hover { background: var(--bg-hover); }
        .dp-status {
          width: 8px; height: 8px; border-radius: 50%;
          background: oklch(0.74 0.16 150);
          box-shadow: 0 0 0 3px oklch(0.74 0.16 150 / 0.18);
        }
        .dp-status.fake { background: oklch(0.74 0.14 var(--accent-hue)); box-shadow: 0 0 0 3px oklch(0.74 0.14 var(--accent-hue) / 0.18); }
        .dp-status.offline { background: var(--fg-3); box-shadow: none; }
        .dp-info { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.1; }
        .dp-name { font-size: var(--t-base); font-weight: 500; }
        .dp-meta { font-size: var(--t-xs); color: var(--fg-3); }
      `}</style>
    </div>
  );
};

window.Toolbar = Toolbar;
