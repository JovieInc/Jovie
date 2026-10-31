import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  revenue: vi.fn(),
  capture: vi.fn(),
}));
vi.mock('@/lib/ovie/summer-oidc.server', () => ({
  verifySummerOidcRequest: mocks.verify,
}));
vi.mock('@/lib/ovie/summer-company.server', () => ({
  getSummerRevenue: mocks.revenue,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.capture }));

import { GET, POST } from './route';

const url = 'https://jov.ie/api/internal/ovie/summer-company/default-alive';
const asOf = new Date().toISOString();
// Synthetic attestation; real figures never live in the repo.
const attestation = {
  cashUsd: { value: 30_000, source: 'founder', asOf },
  fixedBurnUsdPerMonth: { value: 4_000, source: 'founder', asOf },
  expenseGrowthRateMonthly: { value: 0, source: 'founder', asOf },
};
const post = (body: string) => new Request(url, { method: 'POST', body });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verify.mockResolvedValue(true);
  mocks.revenue.mockResolvedValue({
    observedAt: asOf,
    jovie: { mrrUsd: 0, source: 'stripe' },
  });
});

it('authenticates Summer before reading revenue', async () => {
  mocks.verify.mockResolvedValue(false);
  expect((await GET(new Request(url))).status).toBe(401);
  expect((await POST(post('{}'))).status).toBe(401);
  expect(mocks.revenue).not.toHaveBeenCalled();
});

it('returns explicit gaps for cash and fixed burn without an attestation', async () => {
  const body = await (await GET(new Request(url))).json();
  expect(body.verdict).toBe('unknown');
  expect(body.gaps.map((gap: { input: string }) => gap.input)).toEqual(
    expect.arrayContaining(['cashUsd', 'fixedBurnUsdPerMonth'])
  );
});

it('computes the verdict, runway and raise from a posted attestation', async () => {
  const response = await POST(post(JSON.stringify(attestation)));
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.verdict).toBe('default-dead');
  expect(body.inputs.mrrUsd.basis).toBe('measured');
  expect(body.inputs.variableBurnUsdPerMonth.basis).toBe('registry-cap');
  expect(body.runwayMonths).toBeGreaterThan(0);
  expect(body.raise.recommendedUsd).toBeGreaterThan(0);
  expect(body.timing.kind).toBe('now');
});

it('rejects malformed and oversized bodies', async () => {
  expect((await POST(post('{'))).status).toBe(400);
  expect((await POST(post(JSON.stringify({ cashUsd: 5 })))).status).toBe(400);
  expect((await POST(post('x'.repeat(20_000)))).status).toBe(413);
});

it('reports a revenue read failure as 503 and captures it', async () => {
  mocks.revenue.mockRejectedValue(new Error('boom'));
  expect((await GET(new Request(url))).status).toBe(503);
  expect(mocks.capture).toHaveBeenCalled();
});
