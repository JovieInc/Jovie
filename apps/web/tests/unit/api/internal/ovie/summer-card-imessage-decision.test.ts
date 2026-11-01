import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  verify: vi.fn(),
  decide: vi.fn(),
  getCard: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('@/lib/ovie/summer-oidc.server', () => ({
  verifySummerOidcRequest: hoisted.verify,
}));
vi.mock('@/lib/ovie/summer-cards.server', () => ({
  decideSummerCard: hoisted.decide,
  getSummerCard: hoisted.getCard,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: hoisted.captureError }));
vi.mock('@/lib/claim/claim-verification-review.server', () => ({
  profileIdFromClaimCardKey: (key: string | undefined) =>
    key?.startsWith('claim-verification_') ? 'profile-1' : null,
}));

const decision = await import(
  '@/app/api/internal/ovie/summer-cards/[id]/decision/route'
);
const supersede = await import(
  '@/app/api/internal/ovie/summer-cards/[id]/supersede/route'
);

const ID = 'sc_0123456789abcdef0123456789abcdef';
const card = (status: string, kind = 'decision') => ({
  id: ID,
  kind,
  status,
  title: 't',
});
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const post = (path: string, body: unknown) =>
  new Request(`https://jov.ie/api/internal/ovie/summer-cards/${ID}/${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
const receipt = {
  channel: 'imessage',
  messageId: 'msg-1',
  code: 'K7Q2',
  at: '2026-10-31T22:05:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.verify.mockResolvedValue(true);
});

describe('iMessage decision route', () => {
  it('rejects unauthenticated callers', async () => {
    hoisted.verify.mockResolvedValue(false);
    expect(
      (
        await decision.POST(
          post('decision', { decision: 'approve', receipt }),
          ctx()
        )
      ).status
    ).toBe(401);
    expect(hoisted.decide).not.toHaveBeenCalled();
  });

  it('records the founder decision with its receipt', async () => {
    hoisted.decide.mockResolvedValue({
      outcome: 'decided',
      card: card('approved'),
    });
    const res = await decision.POST(
      post('decision', { decision: 'approve', receipt }),
      ctx()
    );
    expect(res.status).toBe(200);
    expect(hoisted.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        id: ID,
        decision: 'approve',
        decidedBy: 'founder:imessage',
        resolution: 'founder',
        comment: 'imessage K7Q2 msg-1 2026-10-31T22:05:00Z',
      })
    );
  });

  it('is idempotent for the same decision and refuses a different one', async () => {
    hoisted.decide.mockResolvedValue({
      outcome: 'already_decided',
      card: card('approved'),
    });
    expect(
      (
        await decision.POST(
          post('decision', { decision: 'approve', receipt }),
          ctx()
        )
      ).status
    ).toBe(200);
    expect(
      (
        await decision.POST(
          post('decision', { decision: 'reject', receipt }),
          ctx()
        )
      ).status
    ).toBe(409);
  });

  it('only accepts approve or reject, a card id and a full receipt', async () => {
    expect(
      (
        await decision.POST(
          post('decision', { decision: 'defer', receipt }),
          ctx()
        )
      ).status
    ).toBe(400);
    expect(
      (await decision.POST(post('decision', { decision: 'approve' }), ctx()))
        .status
    ).toBe(400);
    expect(
      (
        await decision.POST(
          post('decision', { decision: 'approve', receipt }),
          ctx('nope')
        )
      ).status
    ).toBe(400);
    hoisted.decide.mockResolvedValue({ outcome: 'not_found' });
    expect(
      (
        await decision.POST(
          post('decision', { decision: 'approve', receipt }),
          ctx()
        )
      ).status
    ).toBe(404);
  });
});

describe('fleet supersede route', () => {
  it('closes a card with the fleet reason as a reject by default', async () => {
    hoisted.decide.mockResolvedValue({
      outcome: 'decided',
      card: card('rejected'),
    });
    const res = await supersede.POST(
      post('supersede', { reason: 'premise gone: PR merged' }),
      ctx()
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ outcome: 'superseded' });
    expect(hoisted.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: 'reject',
        decidedBy: 'summer:fleet',
        resolution: 'default',
        comment: 'fleet: premise gone: PR merged',
      })
    );
  });

  it('never lets the fleet approve spend or outbound cards', async () => {
    for (const kind of ['spend', 'outbound']) {
      hoisted.getCard.mockResolvedValue(card('pending', kind));
      expect(
        (
          await supersede.POST(
            post('supersede', {
              reason: 'default applies',
              decision: 'approve',
            }),
            ctx()
          )
        ).status
      ).toBe(403);
    }
    expect(hoisted.decide).not.toHaveBeenCalled();
  });

  it('lets the fleet approve a decision card by its default', async () => {
    hoisted.getCard.mockResolvedValue(card('pending', 'decision'));
    hoisted.decide.mockResolvedValue({
      outcome: 'decided',
      card: card('approved'),
    });
    expect(
      (
        await supersede.POST(
          post('supersede', {
            reason: 'registry default',
            decision: 'approve',
          }),
          ctx()
        )
      ).status
    ).toBe(200);
  });
});

describe('claim-verification cards stay with Ovie', () => {
  const claimCard = {
    ...card('pending'),
    idempotencyKey: 'claim-verification_profile-1',
  };

  it('the iMessage decision route refuses them with 409 and records nothing', async () => {
    hoisted.getCard.mockResolvedValue(claimCard);
    const res = await decision.POST(
      post('decision', { decision: 'approve', receipt }),
      ctx()
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'claim_verification_requires_ovie',
    });
    expect(hoisted.decide).not.toHaveBeenCalled();
  });

  it('the fleet supersede route refuses them too, reject included', async () => {
    hoisted.getCard.mockResolvedValue(claimCard);
    for (const decisionValue of ['reject', 'approve']) {
      const res = await supersede.POST(
        post('supersede', { reason: 'premise gone', decision: decisionValue }),
        ctx()
      );
      expect(res.status).toBe(409);
    }
    expect(hoisted.decide).not.toHaveBeenCalled();
  });
});
