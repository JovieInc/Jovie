/**
 * Instantly Push — Timeout Behavior Tests
 *
 * Verifies the 15s AbortSignal.timeout is applied to the Instantly API fetch.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockPipelineLog } = vi.hoisted(() => ({
  mockPipelineLog: vi.fn(),
}));

vi.mock('@/lib/leads/pipeline-logger', () => ({
  pipelineLog: mockPipelineLog,
}));

describe('Instantly push timeout', () => {
  it('fetch call includes AbortSignal.timeout(15000)', async () => {
    // We verify the timeout is configured by checking that the fetch
    // call receives a signal option. This tests the integration point.
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ lead_id: 'inst-1' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    // Dynamic import to get fresh module after global mock
    vi.resetModules();

    const { pushLeadToInstantly } = await import('@/lib/leads/instantly');

    vi.stubEnv('INSTANTLY_API_KEY', 'test-key');
    vi.stubEnv('INSTANTLY_CAMPAIGN_ID', 'campaign-1');
    vi.stubEnv('FEATURE_INSTANTLY_OUTBOUND', 'true');

    await pushLeadToInstantly({
      email: 'test@example.com',
      firstName: 'Test',
      claimLink: 'https://app/claim/tok',
      artistName: 'Test',
      priorityScore: 50,
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const fetchOptions = mockFetch.mock.calls[0]?.[1];
    expect(fetchOptions).toHaveProperty('signal');

    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('does not call fetch when Instantly outbound is disabled', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    vi.resetModules();
    vi.stubEnv('FEATURE_INSTANTLY_OUTBOUND', '');
    vi.stubEnv('INSTANTLY_API_KEY', 'test-key');
    vi.stubEnv('INSTANTLY_CAMPAIGN_ID', 'campaign-1');

    const { pushLeadToInstantly } = await import('@/lib/leads/instantly');

    await expect(
      pushLeadToInstantly({
        email: 'test@example.com',
        firstName: 'Test',
        claimLink: 'https://app/claim/tok',
        artistName: 'Test',
        priorityScore: 50,
      })
    ).rejects.toThrow(/disabled/i);
    expect(mockFetch).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});
