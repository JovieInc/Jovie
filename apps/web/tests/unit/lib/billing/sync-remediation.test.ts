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
vi.mock('@/lib/env-server', () => ({ env: envState }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { runBillingSyncRemediation } from '@/lib/billing/sync-remediation';

const now = new Date('2026-10-02T23:00:00.000Z');
function limitChain(rows: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        orderBy: () => ({ limit: () => Promise.resolve(rows) }),
      }),
    }),
  };
}
function snapshot(lastRun: Date | null, stuck: unknown[] = [], metadata = {}) {
  mockSelect
    .mockReturnValueOnce(
      limitChain(lastRun ? [{ createdAt: lastRun, metadata }] : [])
    )
    .mockReturnValueOnce(limitChain(stuck))
    .mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve([]) }),
    });
}
function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}
function linear(handlers: Record<string, unknown>) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const query = JSON.parse(String(init?.body)).query as string;
    const key = Object.keys(handlers).find(name => query.includes(name));
    if (!key) throw new Error(query.slice(0, 80));
    const value = handlers[key];
    if (typeof value === 'function')
      return (value as (q: string) => Response)(query);
    return json({ data: value });
  });
}
describe('runBillingSyncRemediation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envState.LINEAR_API_KEY = 'lin_test';
    mockInsertValues.mockResolvedValue(undefined);
  });
  afterEach(() => vi.unstubAllGlobals());
  it('does nothing when reconciliation is fresh', async () => {
    snapshot(new Date('2026-10-02T00:00:00.000Z'));
    await expect(runBillingSyncRemediation(now)).resolves.toEqual({
      findings: 0,
      filed: [],
      skipped: false,
    });
    expect(mockInsertValues).not.toHaveBeenCalled();
  });
  it('does not treat a fresh failed receipt as recovery', async () => {
    envState.LINEAR_API_KEY = undefined;
    snapshot(new Date('2026-10-02T22:00:00.000Z'), [], { success: false });
    await expect(runBillingSyncRemediation(now)).rejects.toThrow(
      'LINEAR_API_KEY is not configured'
    );
    expect(mockInsertValues).not.toHaveBeenCalled();
  });
  it('fails closed without LINEAR_API_KEY when a finding exists', async () => {
    envState.LINEAR_API_KEY = undefined;
    snapshot(new Date('2026-07-27T00:00:23.000Z'));
    await expect(runBillingSyncRemediation(now)).rejects.toThrow(
      'LINEAR_API_KEY is not configured'
    );
  });
  it('creates a labeled issue and records the filing', async () => {
    snapshot(null);
    const fetchImpl = linear({
      issueLabels: { issueLabels: { nodes: [] } },
      issueLabelCreate: {
        issueLabelCreate: { success: true, issueLabel: { id: 'label_1' } },
      },
      'issues(': { issues: { nodes: [] } },
      issueCreate: (query: string) => {
        expect(query).toContain('labelIds: $labelIds');
        return json({
          data: { issueCreate: { success: true, issue: { id: 'issue_1' } } },
        });
      },
    });
    vi.stubGlobal('fetch', fetchImpl);
    await expect(runBillingSyncRemediation(now)).resolves.toMatchObject({
      filed: ['billing-sync-stale'],
    });
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        eventType: 'billing_sync_remediation_filed',
        metadata: expect.objectContaining({
          label: 'remediation:billing-sync-stale',
        }),
      })
    );
  });
  it('adds the remediation label instead of replacing labels', async () => {
    snapshot(now, [
      {
        stripeEventId: 'evt_1',
        type: 'invoice.paid',
        createdAt: new Date('2026-10-01T00:00:00.000Z'),
        payload: { data: { object: { id: 'in_1' } } },
      },
    ]);
    const fetchImpl = linear({
      issueLabels: {
        issueLabels: {
          nodes: [
            { id: 'label_stuck', name: 'remediation:billing-webhooks-stuck' },
          ],
        },
      },
      'issues(': {
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
      issueUpdate: (query: string) => {
        expect(query).toContain('addedLabelIds: $labelIds');
        expect(query).not.toContain(', labelIds:');
        return json({
          data: { issueUpdate: { success: true, issue: { id: 'issue_open' } } },
        });
      },
    });
    vi.stubGlobal('fetch', fetchImpl);
    const result = await runBillingSyncRemediation(now);
    expect(result.filed).toEqual(['billing-webhooks-stuck']);
    const updateCall = fetchImpl.mock.calls.find(call =>
      String(call[1]?.body).includes('issueUpdate')
    );
    expect(JSON.parse(String(updateCall?.[1]?.body)).variables).toMatchObject({
      id: 'issue_open',
      labelIds: ['label_stuck'],
    });
  });
});
