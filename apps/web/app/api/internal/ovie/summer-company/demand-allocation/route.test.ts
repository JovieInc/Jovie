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
