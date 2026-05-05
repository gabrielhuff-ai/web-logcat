// WebLogcat — App shell. Owns connection state + tweaks; mounts Dashboard.

const DEVICES = [
  { serial: "RZ8N40ABCDE", model: "Pixel 8 Pro", android: "14", api: 34, status: "online", label: "Pixel 8 Pro" },
  { serial: "98765FAKE001", model: "Samsung Galaxy S24", android: "14", api: 34, status: "online", label: "Galaxy S24" },
  { serial: "emulator-5554", model: "Pixel 7 Emulator", android: "13", api: 33, status: "online", label: "Pixel 7 Emu" },
];
const FAKE_DEVICE = { serial: "fake-device-001", model: "Demo Device", android: "14", api: 34, status: "fake", label: "Demo Device" };

function App() {
  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "theme": "dark",
    "accent": "indigo",
    "density": "cozy",
    "showTimestamps": true,
    "showPid": false,
    "wrapLines": false,
    "showHeatmap": false,
    "streamingSpeed": 1.0,
    "glass": true
  }/*EDITMODE-END*/;
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const [connected, setConnected] = React.useState(false);
  const [device, setDevice] = React.useState(DEVICES[0]);
  const [usingFake, setUsingFake] = React.useState(false);
  const [toast, setToast] = React.useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 1800); };
  const onConnect = () => { setConnected(true); setUsingFake(false); setDevice(DEVICES[0]); showToast("Connected to " + DEVICES[0].label); };
  const onUseFakeData = () => { setConnected(true); setUsingFake(true); setDevice(FAKE_DEVICE); showToast("Demo mode"); };
  const onDisconnect = () => { setConnected(false); setUsingFake(false); };

  React.useEffect(() => {
    document.documentElement.dataset.theme = tweaks.theme;
    document.documentElement.dataset.accent = tweaks.accent;
    document.documentElement.dataset.glass = tweaks.glass ? "on" : "off";
  }, [tweaks.theme, tweaks.accent, tweaks.glass]);

  return (
    <div className="root">
      {!connected ? (
        <EmptyState onConnect={onConnect} onUseFakeData={onUseFakeData} />
      ) : (
        <Dashboard
          device={device}
          devices={usingFake ? [FAKE_DEVICE, ...DEVICES] : DEVICES}
          onSwitchDevice={(d) => { setDevice(d); setUsingFake(d.serial === FAKE_DEVICE.serial); showToast("Switched to " + d.label); }}
          onDisconnect={onDisconnect}
          theme={tweaks.theme}
          setTheme={(v) => setTweak("theme", v)}
          tweaks={tweaks}
          setTweak={setTweak}
          usingFake={usingFake}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
