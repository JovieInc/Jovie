import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  eligibility: vi.fn(),
  backend: vi.fn(),
  govern: vi.fn(),
  capture: vi.fn(),
}));
vi.mock('@/lib/ovie/summer-oidc.server', () => ({
  verifySummerOidcRequest: mocks.verify,
}));
vi.mock('@/lib/acquisition/eligibility.server', () => ({
  getAcquisitionEligibility: mocks.eligibility,
}));
vi.mock('@/lib/ovie/mcp/postgres-backend', () => ({
  postgresRecordBackend: mocks.backend,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.capture }));
vi.mock('@/lib/demand/allocation-governor', async importOriginal => ({
  ...(await importOriginal<
    typeof import('@/lib/demand/allocation-governor')
  >()),
  governDemandAllocation: mocks.govern,
}));

import { DemandAllocationError } from '@/lib/demand/allocation-governor';
import { OutcomeCompilerError } from '@/lib/demand/outcome-compiler';
import { POST } from './route';

const url = 'https://jov.ie/api/internal/ovie/summer-company/demand-allocation';
const request = (body: unknown) =>
  new Request(url, { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.verify.mockResolvedValue(true);
  mocks.backend.mockReturnValue({ durable: true });
  mocks.eligibility.mockResolvedValue({
    eligible: true,
    verdict: 'ELIGIBLE',
    evaluatedAt: new Date().toISOString(),
    contract: 'cone:v1',
    firstBlocker: null,
  });
  mocks.govern.mockResolvedValue({
    contract: 'jovie.demand-allocation/v1',
    rows: [],
  });
});
it('authenticates Summer before parsing or touching evidence and storage', async () => {
  mocks.verify.mockResolvedValue(false);
  expect((await POST(request({ op: 'reconcile' }))).status).toBe(401);
  expect(mocks.eligibility).not.toHaveBeenCalled();
  expect(mocks.backend).not.toHaveBeenCalled();
});
it('rejects malformed, oversized and caller-supplied gate payloads', async () => {
  expect(
    (await POST(new Request(url, { method: 'POST', body: '{' }))).status
  ).toBe(400);
  expect((await POST(request({ op: 'reconcile', gate: 'green' }))).status).toBe(
    400
  );
  expect((await POST(request('x'.repeat(128 * 1024)))).status).toBe(413);
  expect(mocks.govern).not.toHaveBeenCalled();
});
it.each([
  [true, 'ELIGIBLE', 'green'],
  [false, 'BLOCKED', 'red'],
  [false, 'UNKNOWN', 'unknown'],
])(
  'derives the gate from current acquisition receipts (%s, %s)',
  async (eligible, verdict, status) => {
    mocks.eligibility.mockResolvedValue({
      eligible,
      verdict,
      evaluatedAt: new Date().toISOString(),
      contract: 'cone:v1',
      firstBlocker: { id: 'payment' },
    });
    const response = await POST(request({ op: 'reconcile' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.eligibility).toHaveBeenCalledWith({ fresh: true });
    expect(mocks.govern).toHaveBeenCalledWith(
      expect.objectContaining({
        backend: { durable: true },
        gate: expect.objectContaining({ status }),
      })
    );
  }
);
it('holds expansion when the gate source fails while leaving repair allocation available', async () => {
  mocks.eligibility.mockRejectedValue(new Error('offline'));
  expect((await POST(request({ op: 'reconcile' }))).status).toBe(200);
  expect(mocks.govern).toHaveBeenCalledWith(
    expect.objectContaining({
      gate: expect.objectContaining({ status: 'unknown' }),
    })
  );
});
it('exposes overdue execution and review obligations without claiming execution success', async () => {
  mocks.govern.mockResolvedValue({
    rows: [
      {
        plan: { id: 'pending' },
        execution: {
          completedAt: null,
          effortDueAt: '2020-01-01T00:00:00.000Z',
          reviewDueAt: '2020-01-02T00:00:00.000Z',
        },
        reviews: [],
      },
    ],
  });
  expect(await (await POST(request({ op: 'reconcile' }))).json()).toMatchObject(
    { dueReviews: ['pending'], overdueExecutions: ['pending'] }
  );
});
it('returns conflict for rejected allocation and fails closed when persistence fails', async () => {
  mocks.govern.mockRejectedValueOnce(
    new DemandAllocationError('allocation-not-ready')
  );
  expect(
    (await POST(request({ op: 'claim', id: 'bet', worker: 'worker' }))).status
  ).toBe(409);
  mocks.govern.mockRejectedValueOnce(new Error('database unavailable'));
  expect((await POST(request({ op: 'reconcile' }))).status).toBe(503);
  expect(mocks.capture).toHaveBeenCalledOnce();
});

it('does not accept source text or unauthenticated outcome compilation', async () => {
  mocks.verify.mockResolvedValue(false);
  expect((await POST(request({ op: 'compile_outcome' }))).status).toBe(401);
  expect(mocks.govern).not.toHaveBeenCalled();
  mocks.verify.mockResolvedValue(true);
  expect(
    (
      await POST(
        request({ op: 'compile_outcome', rawSourceText: 'restricted' })
      )
    ).status
  ).toBe(400);
  mocks.govern.mockRejectedValueOnce(
    new OutcomeCompilerError('capability-receipt-conflict')
  );
  expect((await POST(request({ op: 'reconcile' }))).status).toBe(409);
});

it('accepts the bounded compiler command through the existing authenticated durable boundary', async () => {
  const command = {
    op: 'compile_outcome',
    outcome: 'presence.profile-current/v1',
    scope: {
      tenantId: '11111111-1111-4111-8111-111111111111',
      subjectId: '22222222-2222-4222-8222-222222222222',
    },
    demand: [
      {
        id: 'authenticated-demand',
        observedAt: '2026-10-20T00:00:00.000Z',
        evidenceRef: 'request:1',
        provenance: { kind: 'founder', sourceKey: 'founder' },
      },
    ],
    facts: [],
    suppliers: [],
    trials: [],
    budget: {
      maxTrialCostCents: 0,
      maxConcurrentTrials: 0,
      valuePerUsefulOutcomeCents: 0,
      minCorrectness: 0.99,
      maxFalseMatchRate: 0.01,
      minCoverage: 0.5,
      maxFreshnessSeconds: 86400,
      maxLatencyMs: 1000,
    },
  };
  expect((await POST(request(command))).status).toBe(200);
  expect(mocks.govern).toHaveBeenCalledWith(
    expect.objectContaining({ command })
  );
});
