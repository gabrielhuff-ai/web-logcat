// Filter chip parsing + matching for WebLogcat.
//
// A filter is { id, type, value, color, regex }.
//   - type: one of "process", "tag", "pid", "level", "message" or null (free text → message)
//   - value: the user-entered string after the colon
//   - color: 1..6 (cycled from the curated chip palette)
//
// Filters do NOT hide rows by default — they highlight matching parts.
// "Show only matches" mode hides rows that match no filter.

const FILTER_TYPES = ["process", "tag", "pid", "level", "message"];

function parseFilter(input) {
  const raw = input.trim();
  if (!raw) return null;
  const colon = raw.indexOf(":");
  if (colon > -1) {
    const type = raw.slice(0, colon).toLowerCase();
    const value = raw.slice(colon + 1).trim();
    if (FILTER_TYPES.includes(type) && value) return { type, value };
  }
  return { type: "message", value: raw };
}

let _fid = 0;
function makeFilter(input, palette = 6) {
  const parsed = parseFilter(input);
  if (!parsed) return null;
  _fid += 1;
  return {
    id: _fid,
    type: parsed.type,
    value: parsed.value,
    color: ((_fid - 1) % palette) + 1,
  };
}

// Does this entry match this filter? (returns boolean)
function entryMatchesFilter(entry, f) {
  if (!f || !f.value) return false;
  const v = f.value.toLowerCase();
  switch (f.type) {
    case "process":
      return entry.pkg.toLowerCase().includes(v);
    case "tag":
      return entry.tag.toLowerCase().includes(v);
    case "pid":
      return String(entry.pid) === f.value || String(entry.tid) === f.value;
    case "level":
      return entry.level.toLowerCase() === v[0];
    case "message":
    default:
      return entry.message.toLowerCase().includes(v) ||
             entry.tag.toLowerCase().includes(v) ||
             entry.pkg.toLowerCase().includes(v);
  }
}

// Returns array of { color, type } that this entry matches.
function entryMatches(entry, filters) {
  const matched = [];
  for (const f of filters) {
    if (entryMatchesFilter(entry, f)) matched.push(f);
  }
  return matched;
}

// Highlight ranges in the message text for a single entry given filters.
// Returns array of { start, end, color } sorted & non-overlapping.
function highlightRanges(text, entry, filters) {
  const ranges = [];
  for (const f of filters) {
    if (f.type !== "message" && f.type !== "tag" && f.type !== "process") continue;
    // We highlight the message field for `message` filters; for tag/process we just color the row chip elsewhere
    if (f.type !== "message") continue;
    const v = f.value;
    if (!v) continue;
    const lower = text.toLowerCase();
    const needle = v.toLowerCase();
    let i = 0;
    while (true) {
      const idx = lower.indexOf(needle, i);
      if (idx < 0) break;
      ranges.push({ start: idx, end: idx + needle.length, color: f.color });
      i = idx + needle.length;
    }
  }
  // Merge overlapping (last one wins)
  ranges.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
      // keep last.color
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}

window.Filters = { FILTER_TYPES, parseFilter, makeFilter, entryMatchesFilter, entryMatches, highlightRanges };
