// @vitest-environment node
import { it } from 'vitest';
import { runFollowupNetworkFixture } from './fixtures/product-crawl-network.mjs';

it('preserves cache, worker coverage and device identity with scoped admission', async () => {
  await runFollowupNetworkFixture();
}, 60_000);
