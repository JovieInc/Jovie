import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  resolvePrincipal: vi.fn(),
  feedback: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('@/lib/ovie/mcp/principal', () => ({
  resolveOviePrincipal: hoisted.resolvePrincipal,
}));
vi.mock('@/lib/ovie/summer-cards.server', () => ({
  recordSummerCardFeedback: hoisted.feedback,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureError,
}));

const { POST } = await import(
  '@/app/api/ovie/summer-cards/[id]/feedback/route'
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
    new Request(`https://jov.ie/api/ovie/summer-cards/${id}/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

describe('POST /api/ovie/summer-cards/[id]/feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.resolvePrincipal.mockResolvedValue(admin);
  });

  it('refuses callers outside founder control', async () => {
    hoisted.resolvePrincipal.mockResolvedValue({ ...admin, isAdmin: false });
    expect((await call({ comment: 'x' })).status).toBe(403);
    hoisted.resolvePrincipal.mockRejectedValue(new Error('down'));
    expect((await call({ comment: 'x' })).status).toBe(503);
    expect(hoisted.feedback).not.toHaveBeenCalled();
  });

  it('validates the id and the comment before writing', async () => {
    expect((await call({ comment: 'x' }, 'bad')).status).toBe(404);
    expect((await call({ comment: '  ' })).status).toBe(422);
    expect((await call({ comment: 'x', decision: 'reject' })).status).toBe(422);
    expect(hoisted.feedback).not.toHaveBeenCalled();
  });

  it('records feedback on a card settled by its default', async () => {
    const card = { id: CARD_ID, status: 'approved', resolution: 'default' };
    hoisted.feedback.mockResolvedValue({ outcome: 'recorded', card });
    const response = await call({ comment: 'Too dark on small phones' });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ card });
    expect(hoisted.feedback).toHaveBeenCalledWith({
      id: CARD_ID,
      comment: 'Too dark on small phones',
    });
  });

  it.each([
    [{ outcome: 'not_found' }, 404, 'not_found'],
    [{ outcome: 'pending', card: { id: CARD_ID } }, 409, 'decide_first'],
    [{ outcome: 'conflict' }, 409, 'busy_retry'],
  ])('maps %o to %i', async (result, status, error) => {
    hoisted.feedback.mockResolvedValue(result);
    const response = await call({ comment: 'x' });
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ error });
  });

  it('reports a store failure as unavailable', async () => {
    hoisted.feedback.mockRejectedValue(new Error('kv down'));
    expect((await call({ comment: 'x' })).status).toBe(503);
    expect(hoisted.captureError).toHaveBeenCalled();
  });
});
