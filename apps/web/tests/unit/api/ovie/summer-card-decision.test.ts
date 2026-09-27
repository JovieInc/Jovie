import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  resolvePrincipal: vi.fn(),
  decide: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('@/lib/ovie/mcp/principal', () => ({
  resolveOviePrincipal: hoisted.resolvePrincipal,
}));
vi.mock('@/lib/ovie/summer-cards.server', () => ({
  decideSummerCard: hoisted.decide,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureError,
}));

const { POST } = await import(
  '@/app/api/ovie/summer-cards/[id]/decision/route'
);

const CARD_ID = 'sc_0123456789abcdef0123456789abcdef';
const admin = {
  authenticated: true,
  isAdmin: true,
  subject: 'user-1',
  email: 'founder@jov.ie',
  scopes: [],
};

function call(body: unknown, id = CARD_ID) {
  return POST(
    new Request(`https://jov.ie/api/ovie/summer-cards/${id}/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

describe('POST /api/ovie/summer-cards/[id]/decision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.resolvePrincipal.mockResolvedValue(admin);
  });

  it('returns 401 for an unauthenticated caller', async () => {
    hoisted.resolvePrincipal.mockResolvedValue({
      authenticated: false,
      isAdmin: false,
      scopes: [],
    });
    const response = await call({ decision: 'approve' });
    expect(response.status).toBe(401);
    expect(hoisted.decide).not.toHaveBeenCalled();
  });

  it('returns 403 for a signed-in non-admin', async () => {
    hoisted.resolvePrincipal.mockResolvedValue({ ...admin, isAdmin: false });
    const response = await call({ decision: 'approve' });
    expect(response.status).toBe(403);
    expect(hoisted.decide).not.toHaveBeenCalled();
  });

  it('returns 404 for a malformed id without querying', async () => {
    const response = await call({ decision: 'approve' }, 'not-a-uuid');
    expect(response.status).toBe(404);
    expect(hoisted.decide).not.toHaveBeenCalled();
  });

  it('rejects an unknown decision with 422', async () => {
    const response = await call({ decision: 'send' });
    expect(response.status).toBe(422);
  });

  it('records the decision and who made it', async () => {
    const card = { id: CARD_ID, status: 'approved', comment: 'ship it' };
    hoisted.decide.mockResolvedValue({ outcome: 'decided', card });
    const response = await call({ decision: 'approve', comment: 'ship it' });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual({ card });
    expect(hoisted.decide).toHaveBeenCalledWith({
      id: CARD_ID,
      decision: 'approve',
      comment: 'ship it',
      decidedBy: 'founder@jov.ie',
    });
  });

  it('keeps decisions final: a second decision is 409', async () => {
    const card = { id: CARD_ID, status: 'rejected' };
    hoisted.decide.mockResolvedValue({ outcome: 'already_decided', card });
    const response = await call({ decision: 'approve' });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: 'already_decided',
      card,
    });
  });

  it('returns 404 for an unknown card', async () => {
    hoisted.decide.mockResolvedValue({ outcome: 'not_found' });
    const response = await call({ decision: 'reject' });
    expect(response.status).toBe(404);
  });
});
