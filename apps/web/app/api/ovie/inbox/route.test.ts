import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REVIEW_INBOX_DECISION_CONTRACT,
  REVIEW_INBOX_PILOT_TENANT,
} from '@/lib/ovie/review-inbox/contract';
import { createPilotReviewCase } from '@/lib/ovie/review-inbox/pilot-fixture';
import { GET, POST } from './route';

const mocks = vi.hoisted(() => ({
  principal: vi.fn(),
  read: vi.fn(),
  entitlements: vi.fn(),
  pilotCase: vi.fn(),
  applyDecision: vi.fn(),
  receiptForAction: vi.fn(),
}));
vi.mock('@/lib/ovie/mcp/principal', () => ({
  resolveOviePrincipal: mocks.principal,
}));
vi.mock('@/lib/ovie/inbox.server', () => ({ readOvieInbox: mocks.read }));
vi.mock('@/lib/ovie/privacy-lock/access', () => ({
  getOvieOperatorEntitlements: mocks.entitlements,
}));
vi.mock('@/lib/ovie/review-inbox/pilot-ledger', () => ({
  readReviewInboxPilotCase: mocks.pilotCase,
  applyReviewInboxDecision: mocks.applyDecision,
  reviewInboxPilotReceiptForAction: mocks.receiptForAction,
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
  mocks.pilotCase.mockReturnValue(createPilotReviewCase());
  mocks.receiptForAction.mockReturnValue(null);
  mocks.applyDecision.mockReturnValue({
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
});
