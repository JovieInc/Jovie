import { describe, expect, it, vi } from 'vitest';
import { readMerges } from '@/lib/ovie/shipping-state/live';

describe('github-merges budget', () => {
  it('gives the six aliased searches a budget longer than the 2.5s single read', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    try {
      await readMerges({
        fetch: async () =>
          new Response(
            JSON.stringify({
              data: Object.fromEntries(
                ['org', 'jovie', 'lyb', 'summer', 'last7', 'prior7'].map(
                  key => [key, { issueCount: 1, nodes: [] }]
                )
              ),
            })
          ),
        githubToken: 'hud-token',
        githubOwner: 'JovieInc',
        githubRepo: 'Jovie',
      });
      expect(timeout).toHaveBeenCalledWith(6000);
    } finally {
      timeout.mockRestore();
    }
  });
});
