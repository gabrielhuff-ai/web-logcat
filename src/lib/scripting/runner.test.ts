import { describe, expect, it } from 'vitest';
import { buildRunArgv } from './runner';

describe('buildRunArgv', () => {
  it('re-sources the script and invokes the function via $1', () => {
    const argv = buildRunArgv({ script: 'f() { echo hi; }', fn: 'f', env: {}, runAsRoot: false });
    expect(argv[0]).toBe('env');
    expect(argv).toContain('sh');
    expect(argv).toContain('-c');
    const ci = argv.indexOf('-c');
    expect(argv[ci + 1]).toBe('f() { echo hi; }\n"$1"');
    // $0 = weblogcat, $1 = fn
    expect(argv.slice(-2)).toEqual(['weblogcat', 'f']);
  });

  it('passes env values as discrete argv tokens (injection-safe)', () => {
    const evil = '; rm -rf / #';
    const argv = buildRunArgv({ script: 's', fn: 'f', env: { PKG: evil }, runAsRoot: false });
    // The dangerous value is one token "PKG=…", never spliced into the command.
    expect(argv).toContain(`PKG=${evil}`);
    const ci = argv.indexOf('-c');
    expect(argv[ci + 1]).not.toContain(evil);
  });

  it('prefixes su 0 when running as root', () => {
    const argv = buildRunArgv({ script: 's', fn: 'f', env: {}, runAsRoot: true });
    expect(argv.slice(0, 3)).toEqual(['su', '0', 'env']);
  });

  it('emits one token per env entry', () => {
    const argv = buildRunArgv({ script: 's', fn: 'f', env: { A: '1', B: '2' }, runAsRoot: false });
    expect(argv).toContain('A=1');
    expect(argv).toContain('B=2');
  });
});
