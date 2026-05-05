// Shell widget — interactive ADB shell. Single pane; multiple shells via multiple widgets.

const FAKE_FS_HINTS = {
  "/": ["acct", "data", "dev", "proc", "sdcard", "storage", "system", "vendor"],
  "/sdcard": ["DCIM", "Download", "Pictures", "Music", "Movies", "Documents", "Android"],
  "/sdcard/Download": ["invoice-202411.pdf", "backup-config.json", "instrumentation-trace.perfetto", "crash-report-2024-12-08.zip", "RELEASE_NOTES.md"],
  "/system/bin": ["sh", "ls", "cat", "toolbox", "am", "pm", "settings", "logcat", "dumpsys", "input", "wm", "cmd"],
};

function execCommand(cmd, state) {
  const trimmed = cmd.trim();
  if (!trimmed) return { lines: [], state };
  const args = trimmed.split(/\s+/);
  const head = args[0];
  let cwd = state.cwd;

  if (head === "clear") return { lines: [], clear: true, state };
  if (head === "exit") return { lines: ["Connection closed."], state, exit: true };

  if (head === "pwd") return { lines: [cwd], state };

  if (head === "cd") {
    const target = args[1] || "/sdcard";
    let next;
    if (target.startsWith("/")) next = target;
    else if (target === "..") {
      const parts = cwd.split("/").filter(Boolean);
      parts.pop();
      next = parts.length ? "/" + parts.join("/") : "/";
    } else {
      next = (cwd === "/" ? "" : cwd) + "/" + target;
    }
    return { lines: [], state: { ...state, cwd: next } };
  }

  if (head === "ls") {
    const path = args[1] && !args[1].startsWith("-") ? args[1] : cwd;
    const entries = FAKE_FS_HINTS[path];
    if (entries) return { lines: [entries.join("  ")], state };
    return { lines: [`ls: ${path}: No such file or directory`], state };
  }

  if (head === "echo") {
    return { lines: [args.slice(1).join(" ")], state };
  }

  if (head === "whoami") return { lines: ["shell"], state };
  if (head === "id") return { lines: ["uid=2000(shell) gid=2000(shell) groups=2000(shell)"], state };
  if (head === "uname") {
    if (args.includes("-a")) return { lines: ["Linux localhost 5.15.41-android13-8 #1 SMP PREEMPT aarch64 Toybox"], state };
    return { lines: ["Linux"], state };
  }
  if (head === "date") return { lines: [new Date().toString()], state };
  if (head === "uptime") return { lines: [`up 4 days, 21:14, load average: 1.42, 1.18, 0.92`], state };

  if (head === "getprop") {
    const key = args[1];
    const props = {
      "ro.product.model": "Pixel 8 Pro",
      "ro.product.brand": "google",
      "ro.product.manufacturer": "Google",
      "ro.build.version.release": "14",
      "ro.build.version.sdk": "34",
      "ro.serialno": "39021FDJG004XF",
    };
    if (key) return { lines: [props[key] || ""], state };
    return { lines: Object.entries(props).map(([k, v]) => `[${k}]: [${v}]`), state };
  }

  if (head === "ps") {
    const procs = window.LogGen?.PROCESSES || [];
    return {
      lines: [
        "USER       PID   PPID  VSZ      RSS    WCHAN            ADDR S NAME",
        ...procs.map(p => `u0_a${100 + (p.pid % 50)}  ${String(p.pid).padEnd(5)} 412   1840412  ${(80000 + p.pid * 11).toString().padEnd(6)} do_epoll_wait      0 S ${p.pkg}`),
      ],
      state,
    };
  }

  if (head === "cat" && args[1]) {
    if (args[1] === "/proc/version") return { lines: ["Linux version 5.15.41-android13-8 (kbuild@...) #1 SMP PREEMPT"], state };
    if (args[1] === "/proc/cpuinfo") return { lines: Array.from({ length: 8 }, (_, i) => `processor\t: ${i}\nBogoMIPS\t: 38.40`).join("\n").split("\n"), state };
    return { lines: [`cat: ${args[1]}: No such file or directory`], state };
  }

  if (head === "help" || head === "?") {
    return {
      lines: [
        "Built-in commands: cd, ls, pwd, echo, cat, ps, getprop, whoami, id, uname, date, uptime, clear, exit",
        "(this is a sandboxed ADB shell — most binaries are not available)",
      ],
      state,
    };
  }

  if (head === "logcat") {
    return { lines: ["(use the Logcat widget instead — Ctrl+C to interrupt)"], state };
  }

  return { lines: [`/system/bin/sh: ${head}: inaccessible or not found`], state };
}

const SHELL_HOST = "shiba";

function ShellWidget({ device }) {
  const [history, setHistory] = React.useState(() => [
    { kind: "system", text: `Connected to ${device?.label || "device"} via ADB shell` },
    { kind: "system", text: `Type 'help' for available commands` },
  ]);
  const [input, setInput] = React.useState("");
  const [cmdHistory, setCmdHistory] = React.useState([]);
  const [histIdx, setHistIdx] = React.useState(-1);
  const [state, setState] = React.useState({ cwd: "/sdcard" });
  const scrollRef = React.useRef(null);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  const submit = (e) => {
    e.preventDefault();
    const cmd = input;
    const result = execCommand(cmd, state);
    const promptLine = { kind: "prompt", host: SHELL_HOST, cwd: state.cwd, text: cmd };
    let newHist;
    if (result.clear) newHist = [];
    else newHist = [...history, promptLine, ...result.lines.map(l => ({ kind: "out", text: l }))];
    setHistory(newHist);
    if (cmd.trim()) setCmdHistory(h => [...h, cmd]);
    setHistIdx(-1);
    setInput("");
    if (result.state) setState(result.state);
  };

  const onKey = (e) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = histIdx === -1 ? cmdHistory.length - 1 : Math.max(0, histIdx - 1);
      if (cmdHistory[next] !== undefined) {
        setHistIdx(next);
        setInput(cmdHistory[next]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx === -1) return;
      const next = histIdx + 1;
      if (next >= cmdHistory.length) {
        setHistIdx(-1);
        setInput("");
      } else {
        setHistIdx(next);
        setInput(cmdHistory[next]);
      }
    } else if (e.key === "l" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      setHistory([]);
    }
  };

  return (
    <div className="sh-widget" onClick={() => inputRef.current?.focus()}>
      <div className="sh-scroll" ref={scrollRef}>
        {history.map((line, i) => {
          if (line.kind === "system") return <div key={i} className="sh-system">{line.text}</div>;
          if (line.kind === "prompt") return (
            <div key={i} className="sh-line">
              <span className="sh-prompt-host">{SHELL_HOST}</span>
              <span className="sh-prompt-sep">:</span>
              <span className="sh-prompt-cwd">{line.cwd}</span>
              <span className="sh-prompt-sym"> $ </span>
              <span className="sh-cmd">{line.text}</span>
            </div>
          );
          return <div key={i} className="sh-line sh-out">{line.text}</div>;
        })}
        <form onSubmit={submit} className="sh-line sh-input-line">
          <span className="sh-prompt-host">{SHELL_HOST}</span>
          <span className="sh-prompt-sep">:</span>
          <span className="sh-prompt-cwd">{state.cwd}</span>
          <span className="sh-prompt-sym"> $ </span>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            spellCheck={false}
            autoComplete="off"
          />
        </form>
      </div>

      <style>{`
        .sh-widget {
          display: flex; flex-direction: column; flex: 1; min-height: 0;
          background: oklch(from var(--bg-0) calc(l - 0.02) c h);
          cursor: text;
        }
        .sh-scroll {
          flex: 1; overflow: auto; min-height: 0;
          padding: 8px 12px 4px 12px;
          font-family: var(--font-mono);
          font-size: 12px;
          line-height: 1.55;
          color: var(--fg-1);
        }
        .sh-line { white-space: pre-wrap; word-break: break-all; }
        .sh-system { color: var(--fg-3); font-style: italic; padding: 2px 0; }
        .sh-out { color: var(--fg-1); }
        .sh-prompt-host { color: oklch(0.74 0.16 150); font-weight: 600; }
        .sh-prompt-sep { color: var(--fg-3); }
        .sh-prompt-cwd { color: oklch(0.78 0.13 220); }
        .sh-prompt-sym { color: var(--fg-3); }
        .sh-cmd { color: var(--fg-0); }
        .sh-input-line { display: flex; align-items: center; }
        .sh-input-line input {
          flex: 1;
          background: transparent; border: 0; outline: 0;
          color: var(--fg-0);
          font-family: inherit; font-size: inherit;
          caret-color: var(--accent);
        }
      `}</style>
    </div>
  );
}

window.ShellWidget = ShellWidget;
