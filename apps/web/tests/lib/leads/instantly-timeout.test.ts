import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { requireCompleteness } = vi.hoisted(() => ({
  requireCompleteness: vi.fn(),
}));
vi.mock('@/lib/profile/completeness.server', () => ({
  requireLeadCompleteness: requireCompleteness,
}));
vi.mock('@/lib/leads/pipeline-logger', () => ({
  pipelineLog: vi.fn(),
  pipelineError: vi.fn(),
}));

import { pushLeadToInstantly } from '@/lib/leads/instantly';

const params = {
  leadId: 'lead-1',
  email: 'artist@example.com',
  firstName: 'River',
  claimLink: 'https://jov.ie/claim/token',
  artistName: 'River Lane',
  priorityScore: 50,
};
describe('Instantly completeness send boundary', () => {
  beforeEach(() => {
    vi.stubEnv('INSTANTLY_API_KEY', 'test-key');
    vi.stubEnv('INSTANTLY_CAMPAIGN_ID', 'campaign-1');
    requireCompleteness.mockReset();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ lead_id: 'inst-1' }),
      })
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it('checks the current lead certificate before a timed outbound request', async () => {
    requireCompleteness.mockResolvedValue(undefined);
    await expect(pushLeadToInstantly(params)).resolves.toBe('inst-1');
    expect(requireCompleteness).toHaveBeenCalledWith('lead-1');
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      'https://api.instantly.ai/api/v2/leads',
      expect.objectContaining({
        method: 'POST',
        signal: expect.any(AbortSignal),
      })
    );
    expect(requireCompleteness.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(fetch).mock.invocationCallOrder[0]
    );
  });
  it.each([
    'missing photo',
    'stale evaluation',
    'profile changed',
    'database unavailable',
  ])('sends nothing when completeness fails: %s', async reason => {
    requireCompleteness.mockRejectedValue(new Error(reason));
    await expect(pushLeadToInstantly(params)).rejects.toThrow(reason);
    expect(fetch).not.toHaveBeenCalled();
  });
});
