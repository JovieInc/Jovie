import { beforeEach, describe, expect, it, vi } from 'vitest';

const envState = vi.hoisted(() => ({
  LINEAR_API_KEY: undefined as string | undefined,
}));

vi.mock('@/lib/env-server', () => ({
  env: envState,
}));

describe('fileBillingWebhookRemediationIssue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    envState.LINEAR_API_KEY = undefined;
    vi.stubGlobal('fetch', vi.fn());
  });

  it('skips Linear when the API key is missing', async () => {
    const { fileBillingWebhookRemediationIssue } = await import(
      '@/lib/billing/webhook-remediation-issue'
    );

    await fileBillingWebhookRemediationIssue({
      examined: 4,
      processed: 0,
      failed: 0,
      subscriptionStateEventIds: [],
    });

    expect(fetch).not.toHaveBeenCalled();
  });

  it('creates the fingerprint issue when none exists', async () => {
    envState.LINEAR_API_KEY = 'lin_test';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              team: { states: { nodes: [] } },
              issues: { nodes: [] },
            },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { issueCreate: { success: true } } }),
          { status: 200 }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    const { fileBillingWebhookRemediationIssue } = await import(
      '@/lib/billing/webhook-remediation-issue'
    );
    await fileBillingWebhookRemediationIssue({
      examined: 4,
      processed: 4,
      failed: 0,
      subscriptionStateEventIds: ['evt_1'],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const init = fetchMock.mock.calls[1]?.[1] as { body?: string };
    const body = JSON.parse(String(init.body)) as {
      variables: { title: string; description: string };
    };
    expect(body.variables.title).toContain('remediation:billing-webhooks');
    expect(body.variables.description).toContain('evt_1');
  });
});
