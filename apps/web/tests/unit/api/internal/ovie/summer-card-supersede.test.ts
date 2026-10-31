import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  supersede: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('@/lib/ovie/summer-oidc.server', () => ({
  verifySummerOidcRequest: mocks.verify,
}));
vi.mock('@/lib/ovie/summer-cards.server', () => ({
  supersedeSummerCard: mocks.supersede,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: mocks.captureError,
}));

const { POST } = await import(
  '@/app/api/internal/ovie/summer-cards/[id]/supersede/route'
);
const id = 'sc_0123456789abcdef0123456789abcdef';
const route = '/api/internal/ovie/summer-cards/[id]/supersede';
const reason = 'No human holds remain';
const card = { id, status: 'rejected', resolution: 'default' };

function request(body: unknown = { reason }) {
  return new Request(
    `https://jov.ie/api/internal/ovie/summer-cards/${id}/supersede`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }
  );
}

function context(cardId = id) {
  return { params: Promise.resolve({ id: cardId }) };
}

describe('POST summer card supersede', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.verify.mockResolvedValue(true);
    mocks.supersede.mockResolvedValue({ outcome: 'superseded', card });
  });

  it('requires Summer OIDC before reading the request or touching storage', async () => {
    mocks.verify.mockResolvedValue(false);
    const input = request('invalid JSON');
    const response = await POST(input, context());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
    expect(mocks.verify).toHaveBeenCalledWith(input);
    expect(input.bodyUsed).toBe(false);
    expect(mocks.supersede).not.toHaveBeenCalled();
  });

  it('rejects invalid card IDs before reading the body', async () => {
    const input = request();
    const response = await POST(input, context('invalid'));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
    expect(input.bodyUsed).toBe(false);
    expect(mocks.supersede).not.toHaveBeenCalled();
  });

  it.each([
    ['malformed JSON', '{', 400],
    ['oversized body', JSON.stringify({ reason: 'x'.repeat(2049) }), 413],
  ])('rejects %s without touching storage', async (_label, body, status) => {
    const response = await POST(request(body), context());
    expect(response.status).toBe(status);
    expect(mocks.supersede).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { reason: 'short' },
    { reason: '        ' },
    { reason: 'x'.repeat(301) },
    { reason, decision: 'approve' },
  ])('rejects an invalid reason or extra fields: %j', async body => {
    const response = await POST(request(body), context());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_request' });
    expect(mocks.supersede).not.toHaveBeenCalled();
  });

  it.each(['superseded', 'already_decided'])(
    'returns the %s card without caching it',
    async outcome => {
      mocks.supersede.mockResolvedValue({ outcome, card });
      const response = await POST(
        request({ reason: `  ${reason}  ` }),
        context()
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toContain('no-store');
      expect(await response.json()).toEqual({ outcome, card });
      expect(mocks.supersede).toHaveBeenCalledExactlyOnceWith({ id, reason });
    }
  );

  it('returns 404 for a missing stored card', async () => {
    mocks.supersede.mockResolvedValue({ outcome: 'not_found' });
    const response = await POST(request(), context());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it.each(['spend', 'outbound', 'decision', 'taste'])(
    'returns 409 for reserved %s cards',
    async kind => {
      mocks.supersede.mockResolvedValue({ outcome: 'reserved', kind });
      const response = await POST(request(), context());
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: 'reserved_kind', kind });
    }
  );

  it('reports storage failures without exposing internal error details', async () => {
    const error = new Error('private database failure');
    mocks.supersede.mockRejectedValue(error);
    const response = await POST(request(), context());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'summer_cards_unavailable',
    });
    expect(mocks.captureError).toHaveBeenCalledWith(
      'Summer card supersede failed',
      error,
      { route }
    );
  });
});
