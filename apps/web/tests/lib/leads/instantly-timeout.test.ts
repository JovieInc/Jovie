/** Direct provider policy regressions; no real network or credentials. */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const INPUT = {
  email: 'creator@example.invalid',
  firstName: 'Creator',
  claimLink: 'https://example.invalid/claim/synthetic',
  artistName: 'Creator',
  priorityScore: 50,
  approvedCopy: {
    channel: 'email' as const,
    subject: 'Reviewed copy',
    body: 'Reviewed draft',
    revision: 'synthetic-review-revision',
  },
};

describe('Instantly provider audience denial', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each(['', 'true', '1'])(
    'never enrolls when the feature flag is %s',
    async flag => {
      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'synthetic-provider-id' }),
      });
      vi.stubGlobal('fetch', fetcher);
      vi.stubEnv('FEATURE_INSTANTLY_OUTBOUND', flag);
      vi.stubEnv('INSTANTLY_API_KEY', 'test-key');
      vi.stubEnv('INSTANTLY_CAMPAIGN_ID', 'synthetic-campaign');
      const { pushLeadToInstantly } = await import('@/lib/leads/instantly');
      await expect(pushLeadToInstantly(INPUT)).rejects.toMatchObject({
        name: 'InstantlyAudienceDeliveryBlockedError',
        code: 'audience_delivery_disabled',
        retryable: false,
        policyReceipt: {
          dispatchAllowed: false,
          retryable: false,
          queueDisposition: 'do_not_enqueue_or_retry',
        },
      });
      expect(fetcher).not.toHaveBeenCalled();
    }
  );

  it('refuses replay, recipient switches and edited copy without transport or retry', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    vi.stubGlobal('fetch', fetcher);
    const { pushLeadToInstantly } = await import('@/lib/leads/instantly');
    for (const input of [
      INPUT,
      INPUT,
      { ...INPUT, email: 'switched@example.invalid' },
      {
        ...INPUT,
        approvedCopy: {
          ...INPUT.approvedCopy,
          channel: 'dm' as const,
          body: 'Edited draft',
        },
      },
    ]) {
      await expect(pushLeadToInstantly(input)).rejects.toMatchObject({
        code: 'audience_delivery_disabled',
        retryable: false,
      });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('refuses before reading recipient or copy input', async () => {
    const recipientRead = vi.fn(() => {
      throw new Error('recipient must not be read');
    });
    const input = { ...INPUT };
    Object.defineProperty(input, 'email', { get: recipientRead });
    const { pushLeadToInstantly } = await import('@/lib/leads/instantly');
    await expect(pushLeadToInstantly(input)).rejects.toMatchObject({
      code: 'audience_delivery_disabled',
      retryable: false,
    });
    expect(recipientRead).not.toHaveBeenCalled();
  });
});
