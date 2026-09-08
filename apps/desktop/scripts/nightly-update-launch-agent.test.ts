import { expect, test, vi } from 'vitest';
import type { RunBoundedProcessInput } from '../src/bounded-process.ts';
import { installNightlyUpdateLaunchAgent } from '../src/nightly-update-launch-agent.ts';

test('skips unpackaged, local, and non-darwin shells', async () => {
  const runProcess = vi.fn();
  const io = {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
  };

  await expect(
    installNightlyUpdateLaunchAgent({
      nightlyUpdateLaunch: false,
      packaged: true,
      platform: 'darwin',
      appEnv: 'local',
      execPath: '/Applications/Jovie.app/Contents/MacOS/Jovie',
      homeDirectory: '/Users/tim',
      uid: 501,
      io,
      runProcess,
    })
  ).resolves.toEqual({ ok: true, skipped: true });
  expect(io.writeFile).not.toHaveBeenCalled();
  expect(runProcess).not.toHaveBeenCalled();
});

test('writes the LaunchAgent plist then bootstraps launchctl', async () => {
  const calls: string[][] = [];
  const io = {
    mkdir: vi.fn(async () => undefined),
    writeFile: vi.fn(async () => undefined),
  };

  const result = await installNightlyUpdateLaunchAgent({
    nightlyUpdateLaunch: false,
    packaged: true,
    platform: 'darwin',
    appEnv: 'production',
    execPath: '/Applications/Jovie.app/Contents/MacOS/Jovie',
    homeDirectory: '/Users/tim',
    uid: 501,
    io,
    runProcess: async (input: RunBoundedProcessInput) => {
      calls.push([input.command, ...(input.args ?? [])]);
      expect(input.waitForExit).toBe(true);
      expect(input.timeoutMs).toBeGreaterThan(0);
      return {
        ok: true,
        spawned: true,
        completed: true,
        exitCode: 0,
        signal: null,
        stdout: '',
        stderr: '',
      };
    },
  });

  expect(result).toEqual({ ok: true });
  expect(io.mkdir).toHaveBeenCalledWith('/Users/tim/Library/LaunchAgents');
  expect(io.writeFile).toHaveBeenCalledTimes(1);
  const [plistPath, plist] = io.writeFile.mock.calls[0] ?? [];
  expect(plistPath).toBe(
    '/Users/tim/Library/LaunchAgents/app.jov.ie.nightly-update.plist'
  );
  expect(plist).toContain('/usr/bin/open');
  expect(plist).toContain('--jovie-nightly-update');
  expect(calls).toEqual([
    ['launchctl', 'bootout', 'gui/501/app.jov.ie.nightly-update'],
    [
      'launchctl',
      'bootstrap',
      'gui/501',
      '/Users/tim/Library/LaunchAgents/app.jov.ie.nightly-update.plist',
    ],
  ]);
});

test('stalled launchctl resolves without throwing', async () => {
  const started = Date.now();
  const result = await installNightlyUpdateLaunchAgent({
    nightlyUpdateLaunch: false,
    packaged: true,
    platform: 'darwin',
    appEnv: 'staging',
    execPath: '/Applications/Jovie Staging.app/Contents/MacOS/Jovie',
    homeDirectory: '/Users/tim',
    uid: 501,
    io: {
      mkdir: async () => undefined,
      writeFile: async () => undefined,
    },
    runProcess: async () =>
      new Promise(resolve => {
        setTimeout(() => {
          resolve({
            ok: false,
            spawned: true,
            completed: false,
            reason: 'timeout',
            message: 'timed out after 3000ms',
            stdout: '',
            stderr: '',
          });
        }, 15);
      }),
  });

  expect(result.ok).toBe(true);
  expect(Date.now() - started).toBeLessThan(500);
});

test('disk and missing-launchctl failures stay structured and nonfatal', async () => {
  await expect(
    installNightlyUpdateLaunchAgent({
      nightlyUpdateLaunch: false,
      packaged: true,
      platform: 'darwin',
      appEnv: 'production',
      execPath: '/Applications/Jovie.app/Contents/MacOS/Jovie',
      homeDirectory: '/Users/tim',
      uid: 501,
      io: {
        mkdir: async () => undefined,
        writeFile: async () => {
          throw new Error('EACCES');
        },
      },
      runProcess: async () => {
        throw new Error('should not run');
      },
    })
  ).resolves.toEqual({ ok: false, reason: 'EACCES' });

  await expect(
    installNightlyUpdateLaunchAgent({
      nightlyUpdateLaunch: false,
      packaged: true,
      platform: 'darwin',
      appEnv: 'production',
      execPath: '/Applications/Jovie.app/Contents/MacOS/Jovie',
      homeDirectory: '/Users/tim',
      uid: 501,
      io: {
        mkdir: async () => undefined,
        writeFile: async () => undefined,
      },
      runProcess: async () => ({
        ok: false,
        spawned: false,
        completed: false,
        reason: 'missing-executable',
        message: 'spawn launchctl ENOENT',
        stdout: '',
        stderr: '',
      }),
    })
  ).resolves.toEqual({ ok: true });
});
