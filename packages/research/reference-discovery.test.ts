import { describe, expect, it, vi } from 'vitest';
import {
  type ReferenceDateWindow,
  type ReferenceDiscoveryAdapter,
  type ReferenceDiscoveryJob,
  type ReferenceDiscoveryRequest,
  referenceDiscoveryKey,
  runReferenceDiscoveryPage,
} from './reference-discovery.ts';

const scope = {
  tenantId: 'tenant',
  actorId: 'actor',
  contextId: 'editorial',
  branchId: 'main',
};
function job(
  patch: Partial<ReferenceDiscoveryJob> = {}
): ReferenceDiscoveryJob {
  return {
    source: 'mock',
    scope,
    query: 'editorial photographs',
    window: { kind: 'all-time' },
    cursor: null,
    calls: 0,
    reservedUsd: 0,
    maxCalls: 2,
    maxUsd: 0.2,
    approvalReceipt: 'test-only-cap',
    status: 'ready',
    seen: [],
    pendingLeads: [],
    revision: 0,
    ...patch,
  };
}
const hit = (v: string) => ({
  source: 'mock',
  title: v,
  url: `https://www.youtube.com/watch?v=${v}`,
  snippet: v,
});
function harness(initial = job()) {
  let stored = initial;
  const page = vi.fn(async (_request: ReferenceDiscoveryRequest) => ({
    hits: [hit('alpha'), hit('beta')],
    cursor: 'page-2' as string | null,
  }));
  const supportsWindow = vi.fn((_window: ReferenceDateWindow) => true);
  const adapter: ReferenceDiscoveryAdapter = {
    name: 'mock',
    maxCallUsd: 0.1,
    supportsWindow,
    page,
  };
  const save = vi.fn(async (revision: number, next: ReferenceDiscoveryJob) => {
    if (stored.revision !== revision) return false;
    stored = structuredClone(next);
    return true;
  });
  return {
    page,
    adapter,
    supportsWindow,
    save,
    get stored() {
      return stored;
    },
    run: (preferred: string[] = [], avoided: string[] = []) =>
      runReferenceDiscoveryPage({
        job: stored,
        scope,
        adapter,
        save,
        preferred,
        avoided,
      }),
  };
}
describe('bounded scoped discovery', () => {
  it('reserves before transport, persists the candidate handoff and resumes pagination without duplicate video IDs', async () => {
    const h = harness();
    await h.run(['monochrome']);
    expect(h.stored.calls).toBe(1);
    expect(h.stored.pendingLeads).toHaveLength(2);
    expect(h.save.mock.invocationCallOrder[0]).toBeLessThan(
      h.page.mock.invocationCallOrder[0]
    );
    h.page.mockResolvedValue({
      hits: [hit('alpha'), hit('gamma')],
      cursor: null,
    });
    const next = await h.run();
    expect(next.leads.map(i => i.title)).toEqual(['gamma']);
    expect(h.stored.pendingLeads).toHaveLength(3);
    expect(h.stored.status).toBe('complete');
    expect(h.page.mock.calls[1][0]).toMatchObject({
      cursor: 'page-2',
      limit: 25,
    });
  });
  it('refuses missing approval, exhausted caps, wrong tenant/source and unsupported archives before transport', async () => {
    for (const patch of [
      { approvalReceipt: null },
      { maxCalls: 0 },
      { maxUsd: 0 },
      { calls: -1 },
      { calls: Number.NaN },
      { reservedUsd: -1 },
      { reservedUsd: Number.NaN },
      { revision: -1 },
      { source: 'other' },
      { scope: { ...scope, tenantId: 'other' } },
    ]) {
      const h = harness(job(patch));
      await expect(h.run()).rejects.toThrow();
      expect(h.page).not.toHaveBeenCalled();
    }
    const h = harness(
      job({
        window: { kind: 'archive', since: '1990-01-01', until: '2000-01-01' },
      })
    );
    h.supportsWindow.mockReturnValue(false);
    await expect(h.run()).rejects.toThrow('date window');
    expect(h.page).not.toHaveBeenCalled();
  });
  it('retains a reserved unknown outcome after transport failure and refuses blind retry', async () => {
    const h = harness();
    h.page.mockRejectedValue(new Error('lost connection'));
    await expect(h.run()).rejects.toThrow('lost connection');
    expect(h.stored.status).toBe('reserved');
    await expect(h.run()).rejects.toThrow('reconciled');
    expect(h.page).toHaveBeenCalledTimes(1);
  });
  it('changes negative-only searches, ranks away from avoided terms and explores one in five calls', async () => {
    const h = harness();
    h.page.mockResolvedValue({
      hits: [
        { ...hit('a'), snippet: 'neon' },
        { ...hit('b'), snippet: 'natural light' },
      ],
      cursor: null,
    });
    const result = await h.run([], ['neon']);
    expect(
      (h.page.mock.calls[0][0] as ReferenceDiscoveryRequest).query
    ).toContain('alternatives to: neon');
    expect(result.leads[0].title).toBe('b');
    const explore = harness(job({ calls: 4, maxCalls: 6, maxUsd: 1 }));
    await explore.run(['monochrome'], ['neon']);
    expect(explore.page.mock.calls[0][0]).toMatchObject({
      query: 'editorial photographs',
    });
  });
  it('keeps cache/idempotency identity scoped to actor/context/branch/source and preserves date semantics', () => {
    const r: ReferenceDiscoveryRequest = {
      source: 'mock',
      scope,
      query: 'test',
      preferred: [],
      avoided: [],
      window: { kind: 'all-time' },
      cursor: null,
      limit: 25,
      requestId: '',
    };
    for (const key of ['tenantId', 'actorId', 'contextId', 'branchId'] as const)
      expect(
        referenceDiscoveryKey({ ...r, scope: { ...scope, [key]: 'other' } })
      ).not.toBe(referenceDiscoveryKey(r));
    expect(referenceDiscoveryKey({ ...r, source: 'other' })).not.toBe(
      referenceDiscoveryKey(r)
    );
    expect(
      referenceDiscoveryKey({
        ...r,
        window: { kind: 'archive', since: '1990-01-01', until: '2000-01-01' },
      })
    ).not.toBe(referenceDiscoveryKey(r));
  });
  it('applies pagination backpressure and rejects forged source identities', async () => {
    const h = harness();
    h.page.mockResolvedValue({
      hits: Array.from({ length: 26 }, (_, i) => hit(String(i))),
      cursor: null,
    });
    await expect(h.run()).rejects.toThrow('bounds');
    const forged = harness();
    forged.page.mockResolvedValue({
      hits: [{ ...hit('a'), source: 'forged' }],
      cursor: null,
    });
    await expect(forged.run()).rejects.toThrow('identity');
  });
});
