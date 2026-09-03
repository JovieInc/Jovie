import { expect, test } from 'vitest';
import {
  decideOperatorLaunch,
  isAllowedOperatorWebUrl,
  terminalLaunchSpec,
} from '../src/operator-launch.ts';

test('allowlists operator web origins and pins Symphony to ssh gem', () => {
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

  const allowed = decideOperatorLaunch({
    id: 'symphony',
    kind: 'ssh',
    sshHost: 'gem',
  });
  expect(allowed).toEqual({
    ok: true,
    action: 'open-ssh',
    host: 'gem',
    command: 'ssh -t gem',
    argv: ['ssh', '-t', 'gem'],
  });
  expect(
    decideOperatorLaunch({
      id: 'symphony',
      kind: 'ssh',
      sshHost: 'evil; curl http://example',
    })
  ).toEqual({ ok: false, reason: 'blocked-ssh-host' });
  const spec = terminalLaunchSpec('darwin', 'ssh -t gem');
  expect(spec?.command).toBe('osascript');
  expect(spec?.args.join(' ')).toContain('ssh -t gem');
  expect(spec?.args.join(' ')).not.toMatch(/token|secret|password/i);
});
