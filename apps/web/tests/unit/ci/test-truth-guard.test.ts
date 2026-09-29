import { expect, it } from 'vitest';

it('executes the integration test truth guard', async () => {
  expect(await import('@/scripts/test-truth-guard.mjs')).toBeDefined();
});
