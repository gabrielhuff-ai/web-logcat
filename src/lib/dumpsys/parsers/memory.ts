// Parser for `dumpsys meminfo system_server` output.
//
// We pick out the high-level fields the MemoryCard wants:
//   - The `** MEMINFO in pid <n> [<pkg>] **` block's Pss / Private Dirty
//     totals + the Java/Native split from the App Summary section.
//   - The "Total PSS by process:" table (sorted, top N kept).
//   - "Total RAM / Free RAM / Used RAM" footer.
//
// Format is whitespace-aligned columns, but the keys are stable enough
// that line-by-line regex matching works without column slicing.

export interface MeminfoProc {
  /** PSS in KB. */
  kb: number;
  /** Process / package name. */
  pkg: string;
  /** PID, when present in the line. */
  pid?: number;
}

export interface MemoryParsed {
  /** Process the `** MEMINFO in pid ... **` block describes (when present). */
  pid: number | null;
  pkg: string | null;
  /** App Summary: Java heap PSS in KB. */
  javaHeapKb: number | null;
  /** App Summary: Native heap PSS in KB. */
  nativeHeapKb: number | null;
  /** App Summary: Code (.so + .dex + .oat + .apk) in KB. */
  codeKb: number | null;
  /** App Summary: Stack in KB. */
  stackKb: number | null;
  /** App Summary: Graphics in KB. */
  graphicsKb: number | null;
  /** App Summary: System (shared / framework) in KB. */
  systemKb: number | null;
  /** Total PSS for the focused block — `TOTAL PSS:` line. */
  totalPssKb: number | null;
  /** Total Private Dirty across the focused block. */
  privateDirtyKb: number | null;
  /** Top processes from the "Total PSS by process" table, sorted desc. */
  procs: MeminfoProc[];
  /** Footer "Total RAM" in KB. */
  totalRamKb: number | null;
  /** Footer "Free RAM" in KB. */
  freeRamKb: number | null;
  /** Footer "Used RAM" in KB. */
  usedRamKb: number | null;
}

/**
 * Parse `dumpsys meminfo system_server` (or any meminfo dump that
 * includes the same headers). Tolerant of missing sections — every
 * field is independently nullable.
 */
export function parseMeminfo(raw: string): MemoryParsed {
  const lines = raw.split(/\r?\n/);

  // ---- Focused process block ---------------------------------------------
  let pid: number | null = null;
  let pkg: string | null = null;
  const head = /\*\*\s+MEMINFO in pid\s+(\d+)\s+\[([^\]]+)\]\s+\*\*/.exec(raw);
  if (head) {
    pid = Number(head[1]);
    pkg = head[2];
  }

  // ---- App Summary -------------------------------------------------------
  const summary = (key: string): number | null => {
    const re = new RegExp(`${escape(key)}\\s*:\\s*([\\d,]+)`, 'i');
    const m = re.exec(raw);
    if (!m) return null;
    const n = Number(m[1].replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  const javaHeapKb = summary('Java Heap');
  const nativeHeapKb = summary('Native Heap');
  const codeKb = summary('Code');
  const stackKb = summary('Stack');
  const graphicsKb = summary('Graphics');
  const systemKb = summary('System');
  const totalPssKb = summary('TOTAL PSS');

  // ---- "Total PSS by process" table --------------------------------------
  const procs: MeminfoProc[] = [];
  let inProcs = false;
  for (const line of lines) {
    if (/Total PSS by process:/i.test(line)) {
      inProcs = true;
      continue;
    }
    if (inProcs) {
      // The list ends at a blank line or the next "Total PSS by ..." header.
      if (/^\s*$/.test(line) || /^Total PSS by/i.test(line)) {
        if (procs.length > 0) break;
        else continue;
      }
      const m = /^\s*([\d,]+)K:\s*(\S+)(?:\s+\(pid\s+(\d+)[^)]*\))?/.exec(line);
      if (m) {
        const kb = Number(m[1].replace(/,/g, ''));
        if (Number.isFinite(kb)) {
          const proc: MeminfoProc = { kb, pkg: m[2] };
          if (m[3]) proc.pid = Number(m[3]);
          procs.push(proc);
        }
      }
    }
  }
  procs.sort((a, b) => b.kb - a.kb);

  // ---- Footer ------------------------------------------------------------
  const tag = (key: string): number | null => {
    const re = new RegExp(`${escape(key)}:\\s*([\\d,]+)K`, 'i');
    const m = re.exec(raw);
    if (!m) return null;
    const n = Number(m[1].replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  };

  // ---- Private Dirty (from the focused block's TOTAL row) ----------------
  // The TOTAL line in the per-process block looks like:
  //   "          TOTAL  136994   100360    29560     1592   210804 ..."
  // We grab the second column.
  let privateDirtyKb: number | null = null;
  const totalRow = /^\s*TOTAL\s+([\d,]+)\s+([\d,]+)/m.exec(raw);
  if (totalRow) {
    const n = Number(totalRow[2].replace(/,/g, ''));
    if (Number.isFinite(n)) privateDirtyKb = n;
  }

  return {
    pid,
    pkg,
    javaHeapKb,
    nativeHeapKb,
    codeKb,
    stackKb,
    graphicsKb,
    systemKb,
    totalPssKb,
    privateDirtyKb,
    procs,
    totalRamKb: tag('Total RAM'),
    freeRamKb: tag('Free RAM'),
    usedRamKb: tag('Used RAM'),
  };
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
