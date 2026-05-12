// Pure-logic tests for the simulator's command runner + ANSI strip.

import { describe, expect, it } from 'vitest';
import {
  execShellSim,
  initialShellSimState,
  stripAnsi,
  type ShellSimState,
} from './shellSim';

const initial = (): ShellSimState => initialShellSimState();

describe('execShellSim — basics', () => {
  it('treats blank input as a no-op', () => {
    const r = execShellSim('   ', initial());
    expect(r.lines).toEqual([]);
    expect(r.state).toEqual({ cwd: '/sdcard' });
    expect(r.clear).toBeUndefined();
    expect(r.exit).toBeUndefined();
  });

  it('echo joins arguments with a single space', () => {
    expect(execShellSim('echo hello   world', initial()).lines).toEqual(['hello world']);
  });

  it('echo with no args prints a blank line', () => {
    expect(execShellSim('echo', initial()).lines).toEqual(['']);
  });

  it('whoami / id / uname / uptime', () => {
    expect(execShellSim('whoami', initial()).lines).toEqual(['shell']);
    expect(execShellSim('id', initial()).lines[0]).toMatch(/uid=2000\(shell\)/);
    expect(execShellSim('uname', initial()).lines).toEqual(['Linux']);
    expect(execShellSim('uname -a', initial()).lines[0]).toMatch(/aarch64/);
    expect(execShellSim('uptime', initial()).lines[0]).toMatch(/load average/);
  });
});

describe('execShellSim — pwd + cd', () => {
  it('pwd reports the current cwd', () => {
    expect(execShellSim('pwd', initial()).lines).toEqual(['/sdcard']);
  });

  it('cd with no arg goes to /sdcard', () => {
    const r = execShellSim('cd', { cwd: '/' });
    expect(r.state.cwd).toBe('/sdcard');
  });

  it('cd absolute path', () => {
    const r = execShellSim('cd /system/bin', initial());
    expect(r.state.cwd).toBe('/system/bin');
  });

  it('cd .. walks up one segment', () => {
    const r = execShellSim('cd ..', { cwd: '/sdcard/Download' });
    expect(r.state.cwd).toBe('/sdcard');
  });

  it('cd .. at root stays at root', () => {
    const r = execShellSim('cd ..', { cwd: '/' });
    expect(r.state.cwd).toBe('/');
  });

  it('cd relative path appends to cwd', () => {
    const r = execShellSim('cd Download', { cwd: '/sdcard' });
    expect(r.state.cwd).toBe('/sdcard/Download');
  });

  it('cd multi-segment relative path with ..', () => {
    const r = execShellSim('cd Download/../Pictures', { cwd: '/sdcard' });
    expect(r.state.cwd).toBe('/sdcard/Pictures');
  });

  it('cd into an unknown directory leaves cwd untouched and prints an error', () => {
    const r = execShellSim('cd nonexistent', { cwd: '/sdcard' });
    expect(r.state.cwd).toBe('/sdcard');
    expect(r.lines[0]).toMatch(/No such file or directory/);
  });

  it('cd to an absolute path outside the fake FS fails', () => {
    const r = execShellSim('cd /no/such/dir', initial());
    expect(r.state.cwd).toBe('/sdcard');
    expect(r.lines[0]).toMatch(/No such file or directory/);
  });

  it('chained cd updates cwd cumulatively', () => {
    let s = initial();
    s = execShellSim('cd /', s).state;
    expect(s.cwd).toBe('/');
    s = execShellSim('cd system', s).state;
    expect(s.cwd).toBe('/system');
    s = execShellSim('cd bin', s).state;
    expect(s.cwd).toBe('/system/bin');
    s = execShellSim('cd ..', s).state;
    expect(s.cwd).toBe('/system');
  });
});

describe('execShellSim — ls', () => {
  it('lists entries under the cwd by default', () => {
    const r = execShellSim('ls', { cwd: '/' });
    expect(r.lines).toEqual([
      ['acct', 'data', 'dev', 'proc', 'sdcard', 'storage', 'system', 'vendor'].join('  '),
    ]);
  });

  it('lists an explicit absolute directory', () => {
    const r = execShellSim('ls /sdcard/Download', initial());
    expect(r.lines[0]).toContain('invoice-202411.pdf');
  });

  it('resolves a relative path against the cwd', () => {
    const r = execShellSim('ls Download', { cwd: '/sdcard' });
    expect(r.lines[0]).toContain('RELEASE_NOTES.md');
  });

  it('reports "No such file or directory" for unknown paths', () => {
    const r = execShellSim('ls /nope', initial());
    expect(r.lines[0]).toMatch(/No such file or directory/);
  });

  it('ignores leading flags', () => {
    const r = execShellSim('ls -la /sdcard', initial());
    expect(r.lines[0]).toContain('DCIM');
  });
});

describe('execShellSim — cat / getprop / ps', () => {
  it('cat /proc/version returns a Linux banner', () => {
    expect(execShellSim('cat /proc/version', initial()).lines[0]).toMatch(/Linux version/);
  });

  it('cat with no operand reports an error', () => {
    expect(execShellSim('cat', initial()).lines[0]).toMatch(/missing operand/);
  });

  it('cat unknown path returns the standard not-found message', () => {
    expect(execShellSim('cat /etc/passwd', initial()).lines[0]).toMatch(
      /No such file or directory/,
    );
  });

  it('getprop with no key dumps the table', () => {
    const lines = execShellSim('getprop', initial()).lines;
    expect(lines.some((l) => l.includes('ro.product.model') && l.includes('Pixel 8 Pro'))).toBe(
      true,
    );
  });

  it('getprop with a known key prints its value', () => {
    expect(execShellSim('getprop ro.build.version.release', initial()).lines).toEqual(['14']);
  });

  it('getprop with an unknown key prints empty', () => {
    expect(execShellSim('getprop nope', initial()).lines).toEqual(['']);
  });

  it('ps prints a header + one row per process', () => {
    const lines = execShellSim('ps', initial()).lines;
    expect(lines[0]).toMatch(/^USER\s+PID/);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.some((l) => l.includes('com.example.shopapp'))).toBe(true);
  });
});

describe('execShellSim — control commands', () => {
  it('clear sets the clear flag', () => {
    const r = execShellSim('clear', initial());
    expect(r.clear).toBe(true);
    expect(r.lines).toEqual([]);
  });

  it('exit sets the exit flag and prints a closing banner', () => {
    const r = execShellSim('exit', initial());
    expect(r.exit).toBe(true);
    expect(r.lines).toEqual(['Connection closed.']);
  });

  it('help and ? both print the same banner', () => {
    const a = execShellSim('help', initial()).lines;
    const b = execShellSim('?', initial()).lines;
    expect(a).toEqual(b);
    expect(a[0]).toMatch(/Built-in commands/);
  });

  it('logcat is intercepted with a hint', () => {
    expect(execShellSim('logcat', initial()).lines[0]).toMatch(/use the Logcat widget/);
  });

  it('unknown command prints the standard not-found error', () => {
    expect(execShellSim('foobar', initial()).lines[0]).toBe(
      '/system/bin/sh: foobar: inaccessible or not found',
    );
  });

  it('does not modify state for a no-op command', () => {
    const before: ShellSimState = { cwd: '/system' };
    const r = execShellSim('echo ping', before);
    expect(r.state).toEqual(before);
  });
});

describe('stripAnsi', () => {
  it('strips simple SGR colour codes', () => {
    expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red');
  });

  it('strips multi-parameter SGR sequences', () => {
    expect(stripAnsi('\x1b[1;33;40mwarn\x1b[0m')).toBe('warn');
  });

  it('strips cursor-move CSI sequences', () => {
    expect(stripAnsi('hello\x1b[2Kworld')).toBe('helloworld');
  });

  it('strips OSC sequences terminated by BEL', () => {
    expect(stripAnsi('\x1b]0;title\x07rest')).toBe('rest');
  });

  it('passes plain text through unchanged', () => {
    expect(stripAnsi('plain text 123')).toBe('plain text 123');
  });
});
