import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
// Use the native loader in both dashboard suites so V8 tracks one CJS module.
const { collectOnly } =
  require('./lighthouse-dashboard-auth.cjs') as typeof import('./lighthouse-dashboard-auth.cjs');
const manifestPath = require.resolve('@lhci/cli/package.json');
const manifest = require(manifestPath) as { bin: { lhci?: string } };
const config = '.lighthouserc.dashboard.pr.json';
const url = 'http://localhost:3000/app';

describe('collect-only report hand-off', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lighthouse-collect-'));
    mkdirSync(join(dir, '.lighthouseci'));
    vi.stubEnv('LIGHTHOUSE_COLLECT_RUNS', '3');
    vi.stubEnv('LIGHTHOUSE_COLLECT_UPLOAD', '1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  function fixture() {
    const lhciDir = join(dir, '.lighthouseci');
    const collectDir = join(dir, 'head');
    const trace = join(dir, 'calls.jsonl');
    const preload = join(dir, 'observe-cli.cjs');
    // Observe the actual child executable and argv while keeping Chromium and
    // external uploads out of this process-boundary test.
    writeFileSync(
      preload,
      `
      const fs = require('node:fs');
      const path = require('node:path');
      const [executable, command, ...args] = process.argv.slice(1);
      fs.appendFileSync(process.env.LHCI_TRACE, JSON.stringify([executable, command, ...args]) + '\\n');
      if (command === 'collect') {
        fs.writeFileSync(path.join(process.env.LHCI_REPORTS, 'lhr-2.json'), '{"side":"head"}');
      }
      process.exit(command === process.env.LHCI_FAIL ? 23 : 0);
    `
    );
    const env = {
      ...process.env,
      LHCI_TRACE: trace,
      LHCI_REPORTS: lhciDir,
      NODE_OPTIONS: `--require="${preload}"`,
    };
    const options = {
      lhciDir,
      collectDir,
      config,
      chromePath: '/bin/true',
      collectUrls: [url],
      env,
    };
    const calls = () =>
      readFileSync(trace, 'utf8')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line));
    return { options, calls, lhciDir, collectDir };
  }

  it('runs the installed collector and uploader with the exact arguments and copies only fresh reports', () => {
    const { options, calls, lhciDir, collectDir } = fixture();
    writeFileSync(join(lhciDir, 'lhr-1.json'), '{"side":"base"}');
    writeFileSync(join(lhciDir, 'keep.txt'), 'not a report');
    expect(collectOnly(options)).toBe(0);
    const executable = resolve(
      dirname(manifestPath),
      String(manifest.bin.lhci)
    );
    expect(calls()).toEqual([
      [
        executable,
        'collect',
        `--config=${config}`,
        '--chromePath=/bin/true',
        '--numberOfRuns=3',
        `--url=${url}`,
      ],
      [executable, 'upload', `--config=${config}`],
    ]);
    expect(readdirSync(collectDir)).toEqual(['lhr-2.json']);
    expect(readFileSync(join(collectDir, 'lhr-2.json'), 'utf8')).toContain(
      'head'
    );
    expect(readdirSync(lhciDir).sort()).toEqual(['keep.txt', 'lhr-2.json']);
  });

  it('propagates collect and upload failures and can omit upload', () => {
    const { options, calls } = fixture();
    const run = (fail: string) =>
      collectOnly({ ...options, env: { ...options.env, LHCI_FAIL: fail } });
    expect(run('collect')).toBe(23);
    expect(calls().map(command => command[1])).toEqual(['collect']);
    expect(run('upload')).toBe(23);
    expect(calls().map(command => command[1])).toEqual([
      'collect',
      'collect',
      'upload',
    ]);
    vi.stubEnv('LIGHTHOUSE_COLLECT_UPLOAD', '');
    expect(run('')).toBe(0);
    expect(calls().map(command => command[1])).toEqual([
      'collect',
      'collect',
      'upload',
      'collect',
    ]);
  });

  it('fails before collection when the installed package declares no executable', () => {
    const { options } = fixture();
    const declared = manifest.bin;
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      manifest.bin = {};
      expect(collectOnly(options)).toBe(1);
      expect(error).toHaveBeenCalledWith(
        'Could not resolve the installed @lhci/cli executable.'
      );
      expect(readdirSync(options.lhciDir)).toEqual([]);
    } finally {
      manifest.bin = declared;
    }
  });
});
