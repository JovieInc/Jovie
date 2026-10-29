import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  verify: vi.fn(),
  load: vi.fn(),
  submit: vi.fn(),
  captureError: vi.fn(),
  selectRows: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('@/lib/ovie/summer-oidc.server', () => ({
  verifySummerOidcRequest: hoisted.verify,
}));
vi.mock('@/lib/email/deliverability/loop.server', () => ({
  loadDeliverability: hoisted.load,
}));
vi.mock('@/lib/ovie/summer-cards.server', () => ({
  submitSummerCard: hoisted.submit,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: hoisted.captureError }));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: hoisted.selectRows }) }),
    }),
    insert: () => ({
      values: () => ({ onConflictDoUpdate: hoisted.upsert }),
    }),
  },
}));

const { GET, POST } = await import(
  '@/app/api/internal/ovie/email-deliverability/route'
);

const URL = 'https://jov.ie/api/internal/ovie/email-deliverability';

const cleanStream = {
  stream: 'transactional',
  domains: ['send.jov.ie'],
  delivered: 600,
  bounced: 1,
  complained: 0,
  bounceRate: 1 / 601,
  complaintRate: 0,
  status: 'ok',
  breaches: [],
};

const observation = {
  forgeEligible: true,
  observedAt: '2026-10-29T12:00:00Z',
  source: 'resend domain page',
  dnsRecord: {
    type: 'CNAME',
    name: 'forge.send.jov.ie',
    value: 'x.resend.com',
  },
};

const post = (body: unknown) =>
  POST(new Request(URL, { method: 'POST', body: JSON.stringify(body) }));

describe('/api/internal/ovie/email-deliverability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.verify.mockResolvedValue(true);
    hoisted.selectRows.mockResolvedValue([]);
    hoisted.upsert.mockResolvedValue(undefined);
    hoisted.load.mockResolvedValue({
      ok: true,
      streams: [cleanStream],
      forge: {},
    });
    hoisted.submit.mockResolvedValue({
      outcome: 'created',
      card: { id: 'sc_forge' },
    });
  });

  it('rejects callers that are not Summer', async () => {
    hoisted.verify.mockResolvedValue(false);
    expect((await GET(new Request(URL))).status).toBe(401);
    expect((await post(observation)).status).toBe(401);
  });

  it('serves the summary with the last Forge observation', async () => {
    hoisted.selectRows.mockResolvedValue([{ value: observation }]);
    const res = await GET(new Request(URL));
    expect(res.status).toBe(200);
    expect(hoisted.load).toHaveBeenCalledWith(expect.any(Date), true);
    expect(await res.json()).toMatchObject({ forgeObservation: observation });
  });

  it('answers 503 when the summary cannot be read', async () => {
    hoisted.load.mockRejectedValue(new Error('db'));
    expect((await GET(new Request(URL))).status).toBe(503);
  });

  it('rejects a malformed observation', async () => {
    expect((await post({ forgeEligible: 'yes' })).status).toBe(400);
  });

  it('files one Forge card only when eligible and clean on real volume', async () => {
    const res = await post(observation);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      recorded: true,
      forge: { ready: true },
      card: 'sc_forge',
    });
    const card = hoisted.submit.mock.calls[0]?.[0];
    expect(card).toMatchObject({ kind: 'decision', defaultDecision: 'none' });
    expect(card.body).toContain('CNAME forge.send.jov.ie -> x.resend.com');
  });

  it('records but files nothing when not eligible or thin', async () => {
    await post({ ...observation, forgeEligible: false });
    hoisted.load.mockResolvedValue({
      streams: [{ ...cleanStream, delivered: 10 }],
    });
    await post(observation);
    expect(hoisted.submit).not.toHaveBeenCalled();
    expect(hoisted.upsert).toHaveBeenCalledTimes(2);
  });

  it('answers 503 when recording fails', async () => {
    hoisted.upsert.mockRejectedValue(new Error('db'));
    expect((await post(observation)).status).toBe(503);
  });
});
