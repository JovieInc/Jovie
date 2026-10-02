import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSelect = vi.hoisted(() => vi.fn());
const mockInsertValues = vi.hoisted(() => vi.fn());
const envState = vi.hoisted(() => ({
  LINEAR_API_KEY: 'lin_test' as string | undefined,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockSelect,
    insert: vi.fn(() => ({ values: mockInsertValues })),
  },
}));

vi.mock('@/lib/env-server', () => ({
  env: envState,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { runBillingSyncRemediation } from '@/lib/billing/sync-remediation';

const now = new Date('2026-10-02T23:00:00.000Z');

function limitChain(rows: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        orderBy: () => ({
          limit: () => Promise.resolve(rows),
        }),
      }),
    }),
  };
}

function whereChain(rows: unknown[]) {
  return {
    from: () => ({
      where: () => Promise.resolve(rows),
    }),
  };
}

function snapshot(options: {
  lastRun: Date | null;
  stuck?: unknown[];
  filed?: unknown[];
}) {
  mockSelect
    .mockReturnValueOnce(
      limitChain(options.lastRun ? [{ createdAt: options.lastRun }] : [])
    )
    .mockReturnValueOnce(limitChain(options.stuck ?? []))
    .mockReturnValueOnce(whereChain(options.filed ?? []));
}

describe('runBillingSyncRemediation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envState.LINEAR_API_KEY = 'lin_test';
    mockInsertValues.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does nothing when reconciliation is fresh and no webhooks are stuck', async () => {
    snapshot({ lastRun: new Date('2026-10-02T00:00:00.000Z') });

    const result = await runBillingSyncRemediation(now);

    expect(result).toEqual({ findings: 0, filed: [], skipped: false });
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it('fails closed when a finding exists and LINEAR_API_KEY is missing', async () => {
    envState.LINEAR_API_KEY = undefined;
    snapshot({ lastRun: new Date('2026-07-27T00:00:23.000Z') });

    await expect(runBillingSyncRemediation(now)).rejects.toThrow(
      'LINEAR_API_KEY is not configured'
    );
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it('creates a labeled issue and records the filing', async () => {
    snapshot({ lastRun: null });
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { query: string };
      if (body.query.includes('issueLabels')) {
        return json({ data: { issueLabels: { nodes: [] } } });
      }
      if (body.query.includes('issueLabelCreate')) {
        return json({
          data: {
            issueLabelCreate: {
              success: true,
              issueLabel: {
                id: 'label_1',
                name: 'remediation:billing-sync-stale',
              },
            },
          },
        });
      }
      if (body.query.includes('issues(')) {
        return json({ data: { issues: { nodes: [] } } });
      }
      expect(body.query).toContain('labelIds: $labelIds');
      expect(body.query).not.toContain('labelIds: ["remediation"]');
      return json({
        data: {
          issueCreate: {
            success: true,
            issue: { id: 'issue_1', identifier: 'JOV-9000' },
          },
        },
      });
    });
    vi.stubGlobal('fetch', fetchImpl);

    const result = await runBillingSyncRemediation(now);

    expect(result.filed).toEqual(['billing-sync-stale']);
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        eventType: 'billing_sync_remediation_filed',
        source: 'remediation',
        metadata: expect.objectContaining({
          fingerprint: 'billing-sync-stale',
          label: 'remediation:billing-sync-stale',
        }),
      })
    );
    const createCall = fetchImpl.mock.calls.find(call =>
      String(call[1]?.body).includes('issueCreate')
    );
    const createBody = JSON.parse(String(createCall?.[1]?.body)) as {
      variables: { title: string; labelIds: string[] };
    };
    expect(createBody.variables.title).toContain('billing-sync-stale');
    expect(createBody.variables.labelIds).toEqual(['label_1']);
  });

  it('adds the remediation label to an existing issue instead of replacing labels', async () => {
    snapshot({
      lastRun: now,
      stuck: [
        {
          stripeEventId: 'evt_1',
          type: 'invoice.paid',
          createdAt: new Date('2026-10-01T00:00:00.000Z'),
          payload: { data: { object: { id: 'in_1' } } },
        },
      ],
    });
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { query: string };
      if (body.query.includes('issueLabels')) {
        return json({
          data: {
            issueLabels: {
              nodes: [
                {
                  id: 'label_stuck',
                  name: 'remediation:billing-webhooks-stuck',
                },
              ],
            },
          },
        });
      }
      if (body.query.includes('issues(')) {
        return json({
          data: {
            issues: {
              nodes: [
                {
                  id: 'issue_open',
                  title: 'Stuck Stripe webhooks (billing-webhooks-stuck)',
                  state: { type: 'started' },
                },
              ],
            },
          },
        });
      }
      expect(body.query).toContain('addedLabelIds');
      expect(body.query).not.toContain('\n            labelIds:');
      return json({
        data: { issueUpdate: { success: true, issue: { id: 'issue_open' } } },
      });
    });
    vi.stubGlobal('fetch', fetchImpl);

    const result = await runBillingSyncRemediation(now);

    expect(result.filed).toEqual(['billing-webhooks-stuck']);
    const updateCall = fetchImpl.mock.calls.find(call =>
      String(call[1]?.body).includes('issueUpdate')
    );
    const updateBody = JSON.parse(String(updateCall?.[1]?.body)) as {
      variables: { id: string; labelIds: string[] };
    };
    expect(updateBody.variables.id).toBe('issue_open');
    expect(updateBody.variables.labelIds).toEqual(['label_stuck']);
  });
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
