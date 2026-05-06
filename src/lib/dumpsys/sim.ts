// Simulator backend for the Dumpsys widget — used when `usingFake` is
// true (no real device). Returns the captured fixtures as the "raw"
// stream; parsing flows through the same `parsePreset()` path so the
// cards see the same shape they would from a Pixel.

import type { DumpsysPresetId, DumpsysResult } from '../dumpsys';
import { parsePreset } from '../dumpsys';

import batteryRaw from './__fixtures__/battery.txt?raw';
import memoryRaw from './__fixtures__/memory.txt?raw';
import cpuRaw from './__fixtures__/cpu.txt?raw';
import gfxRaw from './__fixtures__/gfx.txt?raw';
import wifiRaw from './__fixtures__/wifi.txt?raw';

const RAW: Record<DumpsysPresetId, string> = {
  battery: batteryRaw,
  meminfo: memoryRaw,
  cpuinfo: cpuRaw,
  gfxinfo: gfxRaw,
  wifi: wifiRaw,
};

/**
 * Synchronous + delay-free sim. The widget adds a brief artificial
 * "running…" state on top of this, matching the design reference's
 * spinner timing — see DumpsysWidget for the fake `setTimeout`.
 */
export function runDumpsysSim(id: DumpsysPresetId): DumpsysResult {
  const raw = RAW[id];
  return { id, raw, parsed: parsePreset(id, raw) };
}
