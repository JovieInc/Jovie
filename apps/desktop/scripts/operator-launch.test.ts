import { EventEmitter } from 'node:events';
import { expect, test, vi } from 'vitest';
import {
  decideOperatorLaunch,
  GEM_SSH_COMMAND,
  gemTerminalLaunchSpec,
  isAllowedGemTerminalSenderUrl,
  isAllowedOperatorWebUrl,
  launchGemTerminal,
  parseOperatorLaunchRequest,
} from '../src/operator-launch.ts';

class FakeTerminalProcess extends EventEmitter {
  unref = vi.fn();
}

test('allowlists operator web origins and rejects SSH-shaped generic launches', () => {
  expect(
    isAllowedOperatorWebUrl('https://github.com/JovieInc/Jovie/pulls')
  ).toBe(true);
  expect(isAllowedOperatorWebUrl('http://127.0.0.1:7801/')).toBe(true);
  expect(isAllowedOperatorWebUrl('http://100.64.1.8:7801/')).toBe(true);
  expect(isAllowedOperatorWebUrl('https://staging.jov.ie/')).toBe(true);
  expect(isAllowedOperatorWebUrl('https://evil.jov.ie.example/')).toBe(false);
  expect(
    isAllowedOperatorWebUrl(
      'https://github.com/JovieInc/Jovie/pulls?token=secret'
    )
  ).toBe(false);
  expect(isAllowedOperatorWebUrl('javascript:alert(1)')).toBe(false);
  expect(isAllowedOperatorWebUrl('not a url')).toBe(false);

  expect(
    parseOperatorLaunchRequest({
      id: 'symphony',
      kind: 'ssh',
      sshHost: 'gem',
    })
  ).toBeNull();
  expect(parseOperatorLaunchRequest(null)).toBeNull();
  expect(
    parseOperatorLaunchRequest({ id: '', kind: 'web', href: 'https://jov.ie' })
  ).toBeNull();
  expect(
    parseOperatorLaunchRequest({
      id: 'github-prs',
      kind: 'web',
      href: 'https://github.com/JovieInc/Jovie/pulls',
    })
  ).toEqual({
    id: 'github-prs',
    kind: 'web',
    href: 'https://github.com/JovieInc/Jovie/pulls',
  });
  expect(
    decideOperatorLaunch({
      id: 'github-prs',
      kind: 'web',
      href: 'https://github.com/JovieInc/Jovie/pulls',
    })
  ).toEqual({
    ok: true,
    action: 'open-external',
    url: 'https://github.com/JovieInc/Jovie/pulls',
  });
  expect(
    decideOperatorLaunch({
      id: 'blocked',
      kind: 'web',
      href: 'https://attacker.example',
    })
  ).toEqual({ ok: false, reason: 'blocked-url' });
});

test('authorizes Gem terminal launch only from the Ovie Mac HUD route', () => {
  const appOrigin = 'https://app.jov.ie';
  expect(
    isAllowedGemTerminalSenderUrl('https://app.jov.ie/hud?ovie=mac', appOrigin)
  ).toBe(true);
  expect(
    isAllowedGemTerminalSenderUrl('https://app.jov.ie/hud', appOrigin)
  ).toBe(false);
  expect(
    isAllowedGemTerminalSenderUrl(
      'https://app.jov.ie/app/chat?ovie=mac',
      appOrigin
    )
  ).toBe(false);
  expect(
    isAllowedGemTerminalSenderUrl(
      'https://attacker.example/hud?ovie=mac',
      appOrigin
    )
  ).toBe(false);
  expect(isAllowedGemTerminalSenderUrl('not a url', appOrigin)).toBe(false);
});

test('constructs one fixed macOS Terminal command with no injectable input', () => {
  expect(GEM_SSH_COMMAND).toBe('ssh gem');
  const spec = gemTerminalLaunchSpec('darwin');
  expect(spec).toEqual({
    command: 'osascript',
    args: [
      '-e',
      [
        'tell application "Terminal"',
        'activate',
        'do script "ssh gem"',
        'end tell',
      ].join('\n'),
    ],
  });

  const attemptedInjection = Reflect.apply(gemTerminalLaunchSpec, undefined, [
    'darwin',
    'ssh evil; curl https://attacker.example',
  ]);
  expect(attemptedInjection).toEqual(spec);
  expect(JSON.stringify(attemptedInjection)).not.toMatch(
    /evil|curl|attacker|StrictHostKeyChecking|password/i
  );
});

test('rejects unsupported platforms without spawning a process', async () => {
  const spawnProcess = vi.fn();
  await expect(launchGemTerminal('linux', spawnProcess)).resolves.toEqual({
    ok: false,
    reason: 'unsupported-platform',
  });
  expect(spawnProcess).not.toHaveBeenCalled();
});

test('reports Terminal launch success and process errors', async () => {
  const successProcess = new FakeTerminalProcess();
  const successSpawn = vi.fn(() => successProcess);
  const success = launchGemTerminal('darwin', successSpawn);
  successProcess.emit('exit', 0);
  await expect(success).resolves.toEqual({ ok: true });
  expect(successSpawn).toHaveBeenCalledWith('osascript', [
    '-e',
    expect.stringContaining('do script "ssh gem"'),
  ]);
  expect(successProcess.unref).toHaveBeenCalledTimes(1);

  const failedProcess = new FakeTerminalProcess();
  const failed = launchGemTerminal('darwin', () => failedProcess);
  failedProcess.emit('error', new Error('osascript unavailable'));
  await expect(failed).resolves.toEqual({
    ok: false,
    reason: 'open-terminal-failed',
  });

  const nonzeroProcess = new FakeTerminalProcess();
  const nonzero = launchGemTerminal('darwin', () => nonzeroProcess);
  nonzeroProcess.emit('exit', 1);
  await expect(nonzero).resolves.toEqual({
    ok: false,
    reason: 'open-terminal-failed',
  });

  await expect(
    launchGemTerminal('darwin', () => {
      throw new Error('spawn failed');
    })
  ).resolves.toEqual({ ok: false, reason: 'open-terminal-failed' });
});
