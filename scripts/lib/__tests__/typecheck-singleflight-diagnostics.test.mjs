import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  collectOwnerDiagnostics,
  collectWaitDiagnostics,
  formatDiagnosticLogLine,
  parseProcStatCpu,
  readLinuxProcResourceStats,
  readTsBuildInfoStats,
  resolveTsBuildInfoPath,
} from '../typecheck-singleflight-diagnostics.mjs';

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function makeTempDir() {
  const directory = mkdtempSync(resolve(tmpdir(), 'jovie-singleflight-diag-'));
  temporaryDirectories.push(directory);
  return directory;
}

function procStat({ utime, stime, starttime }) {
  const rest = [
    'R',
    '1',
    '1',
    '1',
    '0',
    '0',
    '0',
    '0',
    '0',
    '0',
    '0',
    String(utime),
    String(stime),
    '0',
    '0',
    '20',
    '0',
    '4',
    '0',
    String(starttime),
  ];
  return `42 (tsc) ${rest.join(' ')}`;
}

describe('typecheck singleflight diagnostic helpers', () => {
  it('resolves tsbuildinfo from --tsBuildInfoFile and tsconfig compilerOptions', () => {
    const cwd = makeTempDir();
    const fromFlag = resolveTsBuildInfoPath(
      ['tsc', '--noEmit', '--tsBuildInfoFile', '.cache/tsbuildinfo'],
      cwd
    );
    expect(fromFlag).toBe(resolve(cwd, '.cache/tsbuildinfo'));

    const tsconfigPath = resolve(cwd, 'tsconfig.typecheck.json');
    writeFileSync(
      tsconfigPath,
      '{\n  "compilerOptions": {\n    "tsBuildInfoFile": ".cache/from-config"\n  }\n}\n'
    );
    const fromConfig = resolveTsBuildInfoPath(
      ['tsc', '-p', 'tsconfig.typecheck.json', '--noEmit'],
      cwd
    );
    expect(fromConfig).toBe(resolve(cwd, '.cache/from-config'));
  });

  it('reports tsbuildinfo age and size without mutating the file', () => {
    const cwd = makeTempDir();
    const path = resolve(cwd, 'cache.tsbuildinfo');
    writeFileSync(path, 'x'.repeat(2048));
    const nowMs = 1_700_000_012_000;
    const mtimeSec = (nowMs - 12_500) / 1000;
    utimesSync(path, mtimeSec, mtimeSec);

    const stats = readTsBuildInfoStats(path, { nowMs });
    expect(stats).toMatchObject({
      path,
      bytes: 2048,
    });
    expect(stats.ageMs).toBeGreaterThanOrEqual(12_000);
    expect(stats.ageMs).toBeLessThan(13_500);

    const missing = readTsBuildInfoStats(resolve(cwd, 'missing.tsbuildinfo'), {
      nowMs,
    });
    expect(missing).toEqual({
      path: resolve(cwd, 'missing.tsbuildinfo'),
      ageMs: null,
      bytes: null,
    });
  });

  it('parses /proc stat+status into lifetime CPU percent and RSS without signaling', () => {
    const files = {
      '/proc/42/stat': procStat({ utime: 300, stime: 200, starttime: 500 }),
      '/proc/42/status': 'Name:\ttsc\nVmRSS:\t4096 kB\n',
      '/proc/uptime': '10.00 20.00\n',
    };
    const readFile = path => {
      if (!(path in files)) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }
      return files[path];
    };

    expect(parseProcStatCpu(files['/proc/42/stat'])).toEqual({
      cpuTicks: 500,
      starttime: 500,
    });

    const stats = readLinuxProcResourceStats(42, { readFile, clkTck: 100 });
    expect(stats).toEqual({
      cpuPct: 100,
      rssKb: 4096,
    });
  });

  it('emits a deterministic owner heartbeat line with tsbuildinfo and child resources', () => {
    const cwd = makeTempDir();
    const tsbuildinfo = resolve(cwd, '.cache/tsbuildinfo');
    const files = {
      '/proc/99/stat': procStat({ utime: 50, stime: 50, starttime: 100 }),
      '/proc/99/status': 'VmRSS:\t2048 kB\n',
      '/proc/uptime': '2.00 0.00\n',
    };

    const diagnostic = collectOwnerDiagnostics({
      phase: 'heartbeat',
      startedAtMs: 1_000,
      nowMs: 16_250,
      childPid: 99,
      command: [
        'tsc',
        '-p',
        'tsconfig.typecheck.json',
        '--tsBuildInfoFile',
        tsbuildinfo,
      ],
      cwd,
      pid: 7,
      readFile: path => {
        if (path in files) {
          return files[path];
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
      stat: () => ({
        mtimeMs: 4_250,
        size: 4096,
      }),
      clkTck: 100,
    });

    const line = formatDiagnosticLogLine(diagnostic);
    expect(line).toContain('phase=heartbeat');
    expect(line).toContain('role=owner');
    expect(line).toContain('elapsedMs=15250');
    expect(line).toContain('childPid=99');
    expect(line).toContain('cpuPct=100.0');
    expect(line).toContain('rssKb=2048');
    expect(line).toContain('tsbuildinfo=.cache/tsbuildinfo');
    expect(line).toContain('tsbuildinfoAgeMs=12000');
    expect(line).toContain('tsbuildinfoBytes=4096');
    expect(line).not.toContain('command=');
    expect(line).not.toMatch(/SIG(?:TERM|KILL|INT)/i);
  });

  it('emits waiter timing without implying lock takeover', () => {
    const line = formatDiagnosticLogLine(
      collectWaitDiagnostics({
        phase: 'heartbeat',
        startedAtMs: 10_000,
        nowMs: 25_400,
        ownerPid: 4242,
        ownerAlive: true,
        lockAgeMs: 90_000,
        command: ['tsc', '--noEmit'],
      })
    );

    expect(line).toContain('phase=heartbeat');
    expect(line).toContain('role=waiter');
    expect(line).toContain('elapsedMs=15400');
    expect(line).toContain('ownerPid=4242');
    expect(line).toContain('ownerAlive=true');
    expect(line).toContain('lockAgeMs=90000');
    expect(line).not.toContain('reason=');
    expect(line).not.toContain('removing stale');
  });
});
