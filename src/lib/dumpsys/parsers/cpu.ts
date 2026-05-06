// Parser for `dumpsys cpuinfo` output.
//
// Format (stable across Android 9+):
//   Load: 1.42 / 1.18 / 0.92
//   CPU usage from <a>ms to <b>ms ago (...):
//     18% 8412/com.example.shopapp: 14% user + 4% kernel / faults: ...
//      ...
//
//    56% TOTAL: 38% user + 14% kernel + 3% iowait + 1% softirq
//   CPU 0:  62% usr + 18% nice +   5% sys +  10% idle ...
//
// We capture load averages, the per-process top list, the TOTAL line,
// and the per-core breakdown.

export interface CpuProc {
  /** Total CPU% across user + kernel attributed to this process. */
  pct: number;
  pid: number;
  pkg: string;
  user: number;
  kernel: number;
}

export interface CpuCore {
  /** 0-based core index. */
  id: number;
  user: number;
  nice: number;
  sys: number;
  idle: number;
  iowait: number;
  irq: number;
  softirq: number;
}

export interface CpuParsed {
  /** 1 / 5 / 15-minute load averages. Null only if the Load line is missing. */
  load: { one: number; five: number; fifteen: number } | null;
  /** Top processes from the breakdown, sorted desc by `pct`. */
  procs: CpuProc[];
  /** Aggregate TOTAL: line. */
  total: {
    pct: number;
    user: number;
    kernel: number;
    iowait: number;
    softirq: number;
  } | null;
  /** Per-core breakdown. Empty if the `CPU N:` lines are absent. */
  cores: CpuCore[];
}

/**
 * Parse `dumpsys cpuinfo` output. Tolerant of minor format drift —
 * unknown lines are skipped; missing sections come back as null/empty.
 */
export function parseCpuinfo(raw: string): CpuParsed {
  const loadMatch = /Load:\s*([\d.]+)\s*\/\s*([\d.]+)\s*\/\s*([\d.]+)/.exec(raw);
  const load = loadMatch
    ? {
        one: Number(loadMatch[1]),
        five: Number(loadMatch[2]),
        fifteen: Number(loadMatch[3]),
      }
    : null;

  const procs: CpuProc[] = [];
  const procRe = /^\s*(\d+)%\s+(\d+)\/(\S+):\s+(\d+)%\s*user\s*\+\s*(\d+)%\s*kernel/;
  for (const line of raw.split(/\r?\n/)) {
    const m = procRe.exec(line);
    if (!m) continue;
    procs.push({
      pct: Number(m[1]),
      pid: Number(m[2]),
      // Strip the trailing colon if the regex leaves it (it shouldn't).
      pkg: m[3].replace(/:+$/, ''),
      user: Number(m[4]),
      kernel: Number(m[5]),
    });
  }
  procs.sort((a, b) => b.pct - a.pct);

  const totalRe =
    /(\d+)%\s+TOTAL:\s+(\d+)%\s*user\s*\+\s*(\d+)%\s*kernel(?:\s*\+\s*(\d+)%\s*iowait)?(?:\s*\+\s*(\d+)%\s*softirq)?/;
  const totalMatch = totalRe.exec(raw);
  const total = totalMatch
    ? {
        pct: Number(totalMatch[1]),
        user: Number(totalMatch[2]),
        kernel: Number(totalMatch[3]),
        iowait: Number(totalMatch[4] ?? 0),
        softirq: Number(totalMatch[5] ?? 0),
      }
    : null;

  const cores: CpuCore[] = [];
  const coreRe =
    /^CPU\s+(\d+):\s+(\d+)%\s*usr\s*\+\s*(\d+)%\s*nice\s*\+\s*(\d+)%\s*sys\s*\+\s*(\d+)%\s*idle(?:\s*\+\s*(\d+)%\s*iow)?(?:\s*\+\s*(\d+)%\s*irq)?(?:\s*\+\s*(\d+)%\s*sirq)?/;
  for (const line of raw.split(/\r?\n/)) {
    const m = coreRe.exec(line);
    if (!m) continue;
    cores.push({
      id: Number(m[1]),
      user: Number(m[2]),
      nice: Number(m[3]),
      sys: Number(m[4]),
      idle: Number(m[5]),
      iowait: Number(m[6] ?? 0),
      irq: Number(m[7] ?? 0),
      softirq: Number(m[8] ?? 0),
    });
  }

  return { load, procs, total, cores };
}
