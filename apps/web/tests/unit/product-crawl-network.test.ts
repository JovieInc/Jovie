// @vitest-environment node
import { expect, it } from 'vitest';
import { runFollowupNetworkFixture } from './fixtures/product-crawl-network.mjs';

it('preserves cache, worker coverage and device identity with scoped admission', async () => {
  const result = await runFollowupNetworkFixture();
  expect(result.candidate).toEqual(result.baseline);
  expect(result.cap.admission.blocked).toBe(2);
}, 60_000);
