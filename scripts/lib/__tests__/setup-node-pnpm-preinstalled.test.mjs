import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

// Self-hosted Macs reuse the pinned pnpm on PATH instead of downloading it
// through pnpm/action-setup over the home uplink (run 38311623148).
const ACTION = resolve(
  import.meta.dirname,
  '../../../.github/actions/setup-node-pnpm/action.yml'
);
const steps = load(readFileSync(ACTION, 'utf8')).runs.steps;
const detect = steps.find(step => step.id === 'preinstalled-pnpm');
const setup = steps.find(step => step.name === 'Setup pnpm');

function runDetect(fakePnpmVersion, packageManager = 'pnpm@9.15.9') {
  const dir = mkdtempSync(join(tmpdir(), 'preinstalled-pnpm-'));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  if (fakePnpmVersion) {
    const pnpm = join(bin, 'pnpm');
    writeFileSync(pnpm, `#!/bin/sh\necho ${fakePnpmVersion}\n`);
    chmodSync(pnpm, 0o755);
  }
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ packageManager }));
  const output = join(dir, 'output');
  writeFileSync(output, '');
  // Only node itself: the real node dir may carry its own pnpm.
  symlinkSync(process.execPath, join(bin, 'node'));
  const result = spawnSync('bash', ['-e', '-c', detect.run], {
    cwd: dir,
    env: {
      PATH: [bin, '/usr/bin', '/bin'].join(delimiter),
      GITHUB_OUTPUT: output,
    },
    encoding: 'utf8',
  });
  return { status: result.status, output: readFileSync(output, 'utf8') };
}

describe('setup-node-pnpm preinstalled pnpm', () => {
  it('runs only on self-hosted runners and gates the installer', () => {
    expect(detect.if).toContain("runner.environment != 'github-hosted'");
    expect(setup.if).toContain(
      "steps.preinstalled-pnpm.outputs.match != 'true'"
    );
    expect(steps.indexOf(detect)).toBeLessThan(steps.indexOf(setup));
  });

  it('reuses a preinstalled pnpm that matches packageManager', () => {
    expect(runDetect('9.15.9')).toEqual({
      status: 0,
      output: 'match=true\n',
    });
  });

  it('ignores the integrity suffix on packageManager', () => {
    expect(runDetect('9.15.9', 'pnpm@9.15.9+sha512.abc').output).toBe(
      'match=true\n'
    );
  });

  it('falls back to the installer on a different or missing pnpm', () => {
    expect(runDetect('10.1.0')).toEqual({ status: 0, output: '' });
    expect(runDetect(null)).toEqual({ status: 0, output: '' });
  });
});
