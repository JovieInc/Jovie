import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REVIEW_INBOX_DECISION_CONTRACT,
  REVIEW_INBOX_PILOT_TENANT,
} from '@/lib/ovie/review-inbox/contract';
import {
  createPilotReviewCase,
  PILOT_V1_DIGEST,
} from '@/lib/ovie/review-inbox/pilot-fixture';
import { GET, POST } from './route';

const mocks = vi.hoisted(() => ({
  principal: vi.fn(),
  read: vi.fn(),
  entitlements: vi.fn(),
  pilotCase: vi.fn(),
  applyDecision: vi.fn(),
  receiptForAction: vi.fn(),
  auth: vi.fn(),
}));
vi.mock('@/lib/auth/cached', () => ({ getFreshAuth: mocks.auth }));
vi.mock('@/lib/ovie/mcp/principal', () => ({
  resolveOviePrincipal: mocks.principal,
}));
vi.mock('@/lib/ovie/inbox.server', () => ({ readOvieInbox: mocks.read }));
vi.mock('@/lib/ovie/privacy-lock/access', () => ({
  getOvieOperatorEntitlements: mocks.entitlements,
}));
vi.mock('@/lib/ovie/review-inbox/store.server', () => ({
  reviewInboxLedger: {
    readCase: mocks.pilotCase,
    apply: mocks.applyDecision,
    receiptFor: mocks.receiptForAction,
  },
}));
const request = () => new Request('https://example.com/api/ovie/inbox');
const pilotRequest = () =>
  new Request('https://example.com/api/ovie/inbox?pilot=review-photo');
beforeEach(() => {
  vi.clearAllMocks();
  mocks.principal.mockResolvedValue({ authenticated: true, isAdmin: true });
  mocks.read.mockResolvedValue({ cases: [], issues: [] });
  mocks.entitlements.mockResolvedValue({
    isAuthenticated: true,
    isAdmin: true,
  });
  mocks.auth.mockResolvedValue({ userId: 'user_founder', sessionId: 's1' });
  mocks.pilotCase.mockResolvedValue(createPilotReviewCase());
  mocks.receiptForAction.mockResolvedValue(null);
  mocks.applyDecision.mockResolvedValue({
    ok: true,
    receipt: { ack: true },
  });
});
describe('Ovie Inbox read access', () => {
  it.each([
    [false, false, 401],
    [true, false, 403],
  ])(
    'denies unauthorized reads before accessing company cases',
    async (authenticated, isAdmin, status) => {
      mocks.principal.mockResolvedValue({ authenticated, isAdmin });
      expect((await GET(request())).status).toBe(status);
      expect(mocks.read).not.toHaveBeenCalled();
    }
  );
  it('returns private uncached projections to an authorized operator', async () => {
    const result = await GET(request());
    expect(result.status).toBe(200);
    expect(result.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await result.json()).toEqual({ cases: [], issues: [] });
  });
  it('returns the synthetic pilot case when pilot=review-photo', async () => {
    const result = await GET(pilotRequest());
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ case: createPilotReviewCase() });
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.pilotCase).toHaveBeenCalledWith({
      tenant: REVIEW_INBOX_PILOT_TENANT,
      principalId: 'user_founder',
      caseId: REVIEW_INBOX_PILOT_TENANT,
    });
  });

  it('fails closed when the durable review store is unavailable', async () => {
    mocks.pilotCase.mockRejectedValueOnce(new Error('kv down'));
    expect((await GET(pilotRequest())).status).toBe(503);
  });

  it('rejects pilot reads without operator session', async () => {
    mocks.entitlements.mockResolvedValueOnce({
      isAuthenticated: false,
      isAdmin: false,
    });
    expect((await GET(pilotRequest())).status).toBe(401);
  });

  it('fails closed on unavailable identity or sources', async () => {
    mocks.principal.mockRejectedValueOnce(new Error('identity unavailable'));
    expect((await GET(request())).status).toBe(503);
    expect(mocks.read).not.toHaveBeenCalled();
    mocks.read.mockRejectedValueOnce(new Error('source unavailable'));
    expect((await GET(request())).status).toBe(503);
  });
});

describe('Ovie review inbox pilot decisions', () => {
  it('rejects bearer-token POSTs', async () => {
    const response = await POST(
      new NextRequest('https://example.com/api/ovie/inbox', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer token',
        },
        body: JSON.stringify({
          contract: REVIEW_INBOX_DECISION_CONTRACT,
          tenant: REVIEW_INBOX_PILOT_TENANT,
          caseId: REVIEW_INBOX_PILOT_TENANT,
          revision: 'v1',
          command: 'favorite',
          actionId: 'bearer-reject',
        }),
      })
    );
    expect(response.status).toBe(403);
  });

  it('saves drawn strokes under the signed-in operator, not an impersonated user', async () => {
    mocks.auth.mockResolvedValue({
      userId: 'user_customer',
      actorUserId: 'user_founder',
      sessionId: 's1',
    });
    const decision = {
      contract: REVIEW_INBOX_DECISION_CONTRACT,
      tenant: REVIEW_INBOX_PILOT_TENANT,
      caseId: REVIEW_INBOX_PILOT_TENANT,
      revision: 'v1',
      command: 'request_changes',
      actionId: 'draw-1',
      strokes: [
        {
          id: 's1',
          assetDigest: PILOT_V1_DIGEST,
          revision: 'v1',
          points: [
            [0.1, 0.1],
            [0.2, 0.2],
          ],
        },
      ],
    };
    const response = await POST(
      new NextRequest('https://example.com/api/ovie/inbox', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(decision),
      })
    );
    expect(response.status).toBe(200);
    expect(mocks.applyDecision).toHaveBeenCalledWith(
      expect.objectContaining({ principalId: 'user_founder' }),
      expect.objectContaining({ strokes: decision.strokes })
    );
  });

  it('rejects strokes with out-of-range points before touching the store', async () => {
    const response = await POST(
      new NextRequest('https://example.com/api/ovie/inbox', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contract: REVIEW_INBOX_DECISION_CONTRACT,
          tenant: REVIEW_INBOX_PILOT_TENANT,
          caseId: REVIEW_INBOX_PILOT_TENANT,
          revision: 'v1',
          command: 'request_changes',
          actionId: 'draw-2',
          strokes: [
            {
              id: 's1',
              assetDigest: PILOT_V1_DIGEST,
              revision: 'v1',
              points: [
                [0.1, 0.1],
                [1.4, 0.2],
              ],
            },
          ],
        }),
      })
    );
    expect(response.status).toBe(400);
    expect(mocks.applyDecision).not.toHaveBeenCalled();
  });
});
