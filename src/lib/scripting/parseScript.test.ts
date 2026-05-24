import { describe, expect, it } from 'vitest';
import { extractFunctionBody, extractFunctions, hasFunction } from './parseScript';

const SCRIPT = `#!/system/bin/sh
# a comment with parens foo()
set_brightness() {
  settings put system screen_brightness "$BRIGHTNESS"
}

force_stop () {
  am force-stop "$PACKAGE"
}

function battery_temp {
  dumpsys battery | awk '/temperature/ {print $2}'
}

# call site, not a definition:
force_stop`;

describe('extractFunctions', () => {
  it('finds POSIX and keyword function definitions', () => {
    expect(extractFunctions(SCRIPT)).toEqual(['set_brightness', 'force_stop', 'battery_temp']);
  });

  it('ignores comment lines and call sites', () => {
    expect(extractFunctions('# foo()\nfoo "$x"\n')).toEqual([]);
  });

  it('de-duplicates repeated definitions', () => {
    expect(extractFunctions('f() {\n:\n}\nf() {\n:\n}\n')).toEqual(['f']);
  });

  it('returns [] for an empty script', () => {
    expect(extractFunctions('')).toEqual([]);
  });
});

describe('hasFunction', () => {
  it('reports membership', () => {
    expect(hasFunction(SCRIPT, 'force_stop')).toBe(true);
    expect(hasFunction(SCRIPT, 'nope')).toBe(false);
  });
});

describe('extractFunctionBody', () => {
  it('slices from the definition through the matching brace', () => {
    const body = extractFunctionBody(SCRIPT, 'set_brightness');
    expect(body).toBe('set_brightness() {\n  settings put system screen_brightness "$BRIGHTNESS"\n}');
  });

  it('handles the keyword form', () => {
    const body = extractFunctionBody(SCRIPT, 'battery_temp');
    expect(body).toContain('function battery_temp {');
    expect(body?.trimEnd().endsWith('}')).toBe(true);
  });

  it('returns null for an unknown function', () => {
    expect(extractFunctionBody(SCRIPT, 'missing')).toBeNull();
  });
});
