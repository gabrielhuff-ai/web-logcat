// Scripting widget — deterministic label → shell-identifier derivation.
//
// A control's label is the single source of truth for the name it gets
// in the shell environment:
//   - an input labelled "Brightness" exports as the env var $BRIGHTNESS
//   - an action/display labelled "Force stop" calls the function force_stop
//
// There is no second user-editable "variable name" field — that would be
// a confusing parallel naming system. The derivation is pure so it can be
// unit-tested and recomputed on the fly when rendering the builder legend.
//
// Identifiers are constrained to POSIX `name` form ([A-Za-z_][A-Za-z0-9_]*)
// because the device shell is mksh (`/system/bin/sh`), which does not
// accept hyphens in function names. Hence underscores, never hyphens.

/**
 * Normalise a label to an UPPER_SNAKE shell-identifier stem. Non-alphanumeric
 * runs collapse to a single underscore; leading/trailing underscores are
 * trimmed. Empty / all-symbol labels fall back to `UNNAMED` so the result is
 * always a valid identifier.
 */
export function slug(label: string): string {
  const s = String(label ?? '')
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  return s || 'UNNAMED';
}

/** Function name an action/display calls, e.g. "Force stop" → `force_stop`. */
export const fnFromLabel = (label: string): string => slug(label).toLowerCase();

/** Bare env-var name an input exports, e.g. "Brightness" → `BRIGHTNESS`. */
export const varNameFromLabel = (label: string): string => slug(label);

/** Env-var reference shown in the UI, e.g. "Brightness" → `$BRIGHTNESS`. */
export const varFromLabel = (label: string): string => '$' + slug(label);
