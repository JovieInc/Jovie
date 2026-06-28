import { expect, test } from 'vitest';
import { decideRendererRecovery } from '../src/renderer-recovery.ts';

const MAX = 2;

test('clean-exit is normal teardown, never recovered', () => {
  expect(
    decideRendererRecovery({ reason: 'clean-exit', reloadCount: 0, maxReloads: MAX })
  ).toBe('ignore');
});

test('a crash reloads while within the budget', () => {
  for (const reason of ['crashed', 'oom', 'killed', 'abnormal-exit', 'launch-failed']) {
    expect(
      decideRendererRecovery({ reason, reloadCount: 0, maxReloads: MAX })
    ).toBe('reload');
    expect(
      decideRendererRecovery({ reason, reloadCount: MAX - 1, maxReloads: MAX })
    ).toBe('reload');
  }
});

test('a crash loop falls back to the failure page instead of black', () => {
  expect(
    decideRendererRecovery({ reason: 'crashed', reloadCount: MAX, maxReloads: MAX })
  ).toBe('failure-page');
  expect(
    decideRendererRecovery({ reason: 'oom', reloadCount: MAX + 5, maxReloads: MAX })
  ).toBe('failure-page');
});
