import { expect, it } from 'vitest';

it('executes the integration test truth guard', { timeout: 60_000 }, async () => {
  expect(await import('@/scripts/test-truth-guard.mjs')).toBeDefined();
});
