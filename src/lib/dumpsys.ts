// Dumpsys runner — turns a preset selection into raw + parsed output.
//
// Preset selection lives in the registry below. Each entry knows how to
// invoke `dumpsys <args>` and (when one exists) which parser to feed the
// raw output into. Presets without a dedicated parser fall through to
// raw-only display in the widget.
//
// Backend selection mirrors the Phase 6 Shell pattern:
//   - Real device → `adb.subprocess.shellProtocol?.spawnWaitText(...)`.
//   - Old device without shell-v2 protocol → typed error so the widget
//     can surface a friendly inline notice (no silent fallback).
//   - Simulator (`usingFake`) path uses the canned fixtures in `sim.ts`.

import type { Adb } from '@yume-chan/adb';
import { parseBattery, type BatteryParsed } from './dumpsys/parsers/battery';
import { parseMeminfo, type MemoryParsed } from './dumpsys/parsers/memory';
import { parseCpuinfo, type CpuParsed } from './dumpsys/parsers/cpu';
import { parseGfxinfo, type GfxParsed } from './dumpsys/parsers/gfx';
import { parseWifi, type WifiParsed } from './dumpsys/parsers/wifi';

/** Identifier for a preset in the toolbar. */
export type DumpsysPresetId =
  | 'battery'
  | 'meminfo'
  | 'cpuinfo'
  | 'gfxinfo'
  | 'wifi';

export interface DumpsysPreset {
  id: DumpsysPresetId;
  /** Short pill label shown in the toolbar. */
  label: string;
  /** One-line description for the dropdown / tooltip. */
  desc: string;
  /** Argument(s) passed after `dumpsys`. */
  args: readonly string[];
}

/** All five Phase 7 presets, ordered as in the design reference. */
export const DUMPSYS_PRESETS: readonly DumpsysPreset[] = [
  { id: 'battery', label: 'Battery', desc: 'Power & charge state', args: ['battery'] },
  { id: 'meminfo', label: 'Memory', desc: 'Memory usage by process', args: ['meminfo', 'system_server'] },
  { id: 'cpuinfo', label: 'CPU', desc: 'CPU usage', args: ['cpuinfo'] },
  { id: 'gfxinfo', label: 'GFX', desc: 'Frame timing for the foreground app', args: ['gfxinfo'] },
  { id: 'wifi', label: 'Wi-Fi', desc: 'Wi-Fi state & networks', args: ['wifi'] },
] as const;

/** Discriminated union of parsed shapes. */
export type DumpsysParsed =
  | { id: 'battery'; data: BatteryParsed }
  | { id: 'meminfo'; data: MemoryParsed }
  | { id: 'cpuinfo'; data: CpuParsed }
  | { id: 'gfxinfo'; data: GfxParsed }
  | { id: 'wifi'; data: WifiParsed };

export interface DumpsysResult {
  id: DumpsysPresetId;
  raw: string;
  parsed: DumpsysParsed;
}

/** Thrown when the device's ADB doesn't expose `shellProtocol` (shell:v2). */
export class DumpsysUnsupportedError extends Error {
  constructor() {
    super('Shell-protocol v2 not supported by this device.');
    this.name = 'DumpsysUnsupportedError';
  }
}

/**
 * Run a preset against a real `Adb` handle. Returns both the captured
 * raw text and the typed parsed shape. Throws `DumpsysUnsupportedError`
 * on devices without shell-v2.
 */
export async function runDumpsys(
  adb: Adb,
  id: DumpsysPresetId,
): Promise<DumpsysResult> {
  const preset = DUMPSYS_PRESETS.find((p) => p.id === id);
  if (!preset) {
    throw new Error(`Unknown dumpsys preset: ${id}`);
  }
  const shellProtocol = adb.subprocess.shellProtocol;
  if (!shellProtocol) {
    throw new DumpsysUnsupportedError();
  }

  const proc = await shellProtocol.spawnWaitText(['dumpsys', ...preset.args]);
  const raw = proc.stdout;
  return { id, raw, parsed: parsePreset(id, raw) };
}

/** Standalone helper — also used by the simulator path to wrap canned text. */
export function parsePreset(id: DumpsysPresetId, raw: string): DumpsysParsed {
  switch (id) {
    case 'battery':
      return { id, data: parseBattery(raw) };
    case 'meminfo':
      return { id, data: parseMeminfo(raw) };
    case 'cpuinfo':
      return { id, data: parseCpuinfo(raw) };
    case 'gfxinfo':
      return { id, data: parseGfxinfo(raw) };
    case 'wifi':
      return { id, data: parseWifi(raw) };
  }
}
