import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  verify: vi.fn(),
  submit: vi.fn(),
  list: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('@/lib/ovie/summer-oidc.server', () => ({
  verifySummerOidcRequest: hoisted.verify,
}));
vi.mock('@/lib/ovie/summer-cards.server', () => ({
  submitSummerCard: hoisted.submit,
  listSummerCards: hoisted.list,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureError,
}));

const { GET, POST } = await import(
  '@/app/api/internal/ovie/summer-cards/route'
);

const URL_BASE = 'https://jov.ie/api/internal/ovie/summer-cards';

const input = {
  idempotencyKey: 'outreach-2026-09-26',
  kind: 'outbound',
  product: 'jov',
  title: 'Email 12 claimed artists',
  body: 'Hi, your Jovie profile is live.',
  recommendation: 'Send it',
  recipient: 'claimed artists',
  evidence: ['https://jov.ie/app/ov/growth'],
};

const card = {
  id: 'sc_0123456789abcdef0123456789abcdef',
  ...input,
  defaultIfSilent: null,
  amountUsd: null,
  status: 'pending',
  comment: null,
  createdAt: '2026-09-26T10:00:00.000Z',
  decidedAt: null,
};

function post(body: unknown): Request {
  return new Request(URL_BASE, {
    method: 'POST',
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/internal/ovie/summer-cards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.verify.mockResolvedValue(true);
  });

  it('returns 401 without touching the store when OIDC fails', async () => {
    hoisted.verify.mockResolvedValue(false);
    const response = await POST(post(input));
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(hoisted.submit).not.toHaveBeenCalled();
  });

  it('creates a card with 201', async () => {
    hoisted.submit.mockResolvedValue({ outcome: 'created', card });
    const response = await POST(post(input));
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ card });
    expect(hoisted.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: input.idempotencyKey,
        defaultIfSilent: null,
        amountUsd: null,
      })
    );
  });

  it('replays an identical submission with 200 and the existing card', async () => {
    hoisted.submit.mockResolvedValue({ outcome: 'replayed', card });
    const response = await POST(post(input));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ card });
  });

  it('returns 409 when the key was used for a different payload', async () => {
    hoisted.submit.mockResolvedValue({ outcome: 'conflict' });
    const response = await POST(post(input));
    expect(response.status).toBe(409);
  });

  it.each([
    ['bad key', { ...input, idempotencyKey: 'short' }],
    ['unknown kind', { ...input, kind: 'deploy' }],
    ['http evidence', { ...input, evidence: ['http://jov.ie'] }],
    [
      'too much evidence',
      { ...input, evidence: Array(17).fill('https://jov.ie') },
    ],
    ['negative spend', { ...input, amountUsd: -1 }],
    ['unknown field', { ...input, send: true }],
  ])('rejects %s with 422', async (_label, body) => {
    const response = await POST(post(body));
    expect(response.status).toBe(422);
    expect(hoisted.submit).not.toHaveBeenCalled();
  });

  it('rejects bodies over 32 KB with 413', async () => {
    const response = await POST(post({ ...input, body: 'x'.repeat(33_000) }));
    expect(response.status).toBe(413);
  });

  it('fails closed with 503 when the store throws', async () => {
    hoisted.submit.mockRejectedValue(new Error('db down'));
    const response = await POST(post(input));
    expect(response.status).toBe(503);
  });
});

describe('GET /api/internal/ovie/summer-cards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.verify.mockResolvedValue(true);
  });

  it('returns 401 when OIDC fails', async () => {
    hoisted.verify.mockResolvedValue(false);
    const response = await GET(new Request(URL_BASE));
    expect(response.status).toBe(401);
    expect(hoisted.list).not.toHaveBeenCalled();
  });

  it('lists cards with the parsed filters', async () => {
    hoisted.list.mockResolvedValue([card]);
    const response = await GET(
      new Request(
        `${URL_BASE}?status=decided&since=2026-09-01T00:00:00.000Z&limit=10`
      )
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ cards: [card] });
    expect(hoisted.list).toHaveBeenCalledWith({
      status: 'decided',
      since: '2026-09-01T00:00:00.000Z',
      limit: 10,
    });
  });

  it('defaults to pending cards', async () => {
    hoisted.list.mockResolvedValue([]);
    await GET(new Request(URL_BASE));
    expect(hoisted.list).toHaveBeenCalledWith({ status: 'pending', limit: 50 });
  });

  it('rejects a limit over 100', async () => {
    const response = await GET(new Request(`${URL_BASE}?limit=101`));
    expect(response.status).toBe(400);
  });
});
