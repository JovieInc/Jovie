import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getCachedAuth: vi.fn(),
  loadState: vi.fn(),
  recordDecision: vi.fn(),
  approveSnapshot: vi.fn(),
}));

vi.mock('@/lib/admin/middleware', () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: mocks.getCachedAuth }));
vi.mock('@/lib/investors/update-store', () => ({
  loadInvestorUpdateReviewState: mocks.loadState,
  recordInvestorUpdateCandidateDecision: mocks.recordDecision,
  approveInvestorUpdateSnapshot: mocks.approveSnapshot,
}));

import { GET, POST } from './route';

const DRAFT_ID = '11111111-1111-4111-8111-111111111111';
const CANDIDATE_ID = '22222222-2222-4222-8222-222222222222';
const APPROVAL_ID = '33333333-3333-4333-8333-333333333333';

function post(body: unknown): Request {
  return new Request('https://jov.ie/api/admin/investors/updates', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/admin/investors/updates approval-only boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue(null);
    mocks.getCachedAuth.mockResolvedValue({ userId: 'user_founder' });
    mocks.loadState.mockResolvedValue({ draft: null, candidates: [] });
  });

  it('protects reads before loading private investor-update state', async () => {
    mocks.requireAdmin.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    );
    const response = await GET();
    expect(response.status).toBe(401);
    expect(mocks.loadState).not.toHaveBeenCalled();
  });

  it('records Share as a decision only', async () => {
    const response = await POST(
      post({
        action: 'candidate_decision',
        draftId: DRAFT_ID,
        candidateId: CANDIDATE_ID,
        decision: 'share',
        editedClaim: null,
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.recordDecision).toHaveBeenCalledWith({
      action: 'candidate_decision',
      draftId: DRAFT_ID,
      candidateId: CANDIDATE_ID,
      decision: 'share',
      editedClaim: null,
      userId: 'user_founder',
    });
    expect(mocks.approveSnapshot).not.toHaveBeenCalled();
  });

  it('passes exact copy, every role, and tracking-off settings to final approval', async () => {
    const segments = [
      { role: 'investor', included: true, recipientCount: 12 },
      { role: 'advisor', included: false, recipientCount: 0 },
      { role: 'founder_self', included: true, recipientCount: 1 },
      { role: 'other_explicit', included: false, recipientCount: 0 },
    ];
    const response = await POST(
      post({
        action: 'final_approval',
        draftId: DRAFT_ID,
        expectedRenderedCopy:
          'Jovie August Update\n\nWins\n- Source-backed win.',
        segments,
        recipientCount: 13,
        trackingSettings: {
          opens: false,
          clicks: false,
          privacyDisclosureVersion: null,
          consentBasis: null,
        },
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.approveSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRenderedCopy:
          'Jovie August Update\n\nWins\n- Source-backed win.',
        segments,
        recipientCount: 13,
        trackingSettings: expect.objectContaining({
          opens: false,
          clicks: false,
        }),
        userId: 'user_founder',
      })
    );
  });

  it('rejects receipt creation until a trusted provider adapter exists', async () => {
    const response = await POST(
      post({
        action: 'delivery_receipt',
        approvalId: APPROVAL_ID,
        eventType: 'delivered',
        recipientCount: 13,
        externalReference: 'provider-event-redacted-1',
        occurredAt: '2026-08-29T16:10:00.000Z',
      })
    );
    expect(response.status).toBe(400);
  });

  it('rejects any send-shaped action without invoking a mutation', async () => {
    const response = await POST(
      post({
        action: 'send',
        draftId: DRAFT_ID,
        recipients: ['person@example.com'],
      })
    );
    expect(response.status).toBe(400);
    expect(mocks.recordDecision).not.toHaveBeenCalled();
    expect(mocks.approveSnapshot).not.toHaveBeenCalled();
  });

  it('rejects contact-shaped fields even on an otherwise valid mutation', async () => {
    const response = await POST(
      post({
        action: 'candidate_decision',
        draftId: DRAFT_ID,
        candidateId: CANDIDATE_ID,
        decision: 'share',
        editedClaim: null,
        email: 'person@example.com',
      })
    );
    expect(response.status).toBe(400);
    expect(mocks.recordDecision).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON without invoking a mutation', async () => {
    const response = await POST(
      new Request('https://jov.ie/api/admin/investors/updates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not-json',
      })
    );
    expect(response.status).toBe(400);
    expect(mocks.recordDecision).not.toHaveBeenCalled();
    expect(mocks.approveSnapshot).not.toHaveBeenCalled();
  });
});
