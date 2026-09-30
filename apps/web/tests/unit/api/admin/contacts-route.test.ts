import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  getByKey: vi.fn(),
  getContacts: vi.fn(),
  timeline: vi.fn(),
  setStage: vi.fn(),
  inspect: vi.fn(),
  review: vi.fn(),
  certify: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/ovie/privacy-lock/access', () => ({
  getOvieOperatorEntitlements: mocks.access,
}));
vi.mock('@/lib/admin/contacts', () => ({
  getCanonicalContactByKey: mocks.getByKey,
  getCanonicalContacts: mocks.getContacts,
  getContactStageTimeline: mocks.timeline,
  setCanonicalContactStage: mocks.setStage,
}));
vi.mock('@/lib/admin/contact-certification', () => ({
  getContactCertificationInspection: mocks.inspect,
  reviewContactEvidence: mocks.review,
  certifyContactEvidence: mocks.certify,
}));

import { GET, POST } from '@/app/api/admin/contacts/route';

const CONTACT = { dedupeKey: 'email:ada@example.com' };

function admin() {
  mocks.access.mockResolvedValue({
    isAuthenticated: true,
    isAdmin: true,
    userId: 'f1',
  });
}

function post(body: unknown) {
  return new Request('https://jov.ie/api/admin/contacts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  admin();
});

describe('GET /api/admin/contacts', () => {
  it('requires admin for reads', async () => {
    mocks.access.mockResolvedValue({ isAuthenticated: false });
    const res = await GET(new Request('https://jov.ie/api/admin/contacts'));
    expect(res.status).toBe(401);
    mocks.access.mockResolvedValue({ isAuthenticated: true, isAdmin: false });
    const forbidden = await GET(
      new Request('https://jov.ie/api/admin/contacts')
    );
    expect(forbidden.status).toBe(403);
  });

  it('returns certification and timeline for a single contact', async () => {
    mocks.getByKey.mockResolvedValue(CONTACT);
    mocks.timeline.mockResolvedValue([
      {
        id: 't1',
        fromStage: 'approved',
        toStage: 'certified',
        actorType: 'founder',
        actorId: 'f1',
        source: 'admin_contacts',
        reason: 'verified',
        createdAt: new Date('2026-09-30T00:00:00Z'),
      },
    ]);
    mocks.inspect.mockResolvedValue({ status: 'needs_review', items: [] });

    const res = await GET(
      new Request(
        'https://jov.ie/api/admin/contacts?key=email%3Aada%40example.com'
      )
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.certification.status).toBe('needs_review');
    expect(body.timeline[0].createdAt).toBe('2026-09-30T00:00:00.000Z');
    expect(mocks.inspect).toHaveBeenCalledWith(CONTACT);
  });

  it('returns 404 for an unknown contact key', async () => {
    mocks.getByKey.mockResolvedValue(null);
    const res = await GET(
      new Request('https://jov.ie/api/admin/contacts?key=missing')
    );
    expect(res.status).toBe(404);
  });
});

describe('POST /api/admin/contacts evidence actions', () => {
  it('rejects malformed bodies and unknown contacts', async () => {
    expect(
      (
        await POST(
          new Request('https://jov.ie/api/admin/contacts', {
            method: 'POST',
            body: 'not json',
          })
        )
      ).status
    ).toBe(400);

    expect((await POST(post({}))).status).toBe(400);

    mocks.getByKey.mockResolvedValue(null);
    const res = await POST(
      post({ dedupeKey: 'k', action: 'certify_profile', evidenceRevision: 'r' })
    );
    expect(res.status).toBe(404);
  });

  it('validates review_evidence payloads', async () => {
    mocks.getByKey.mockResolvedValue(CONTACT);
    const missing = await POST(
      post({ dedupeKey: 'k', action: 'review_evidence' })
    );
    expect(missing.status).toBe(400);

    const badDecision = await POST(
      post({
        dedupeKey: 'k',
        action: 'review_evidence',
        evidenceKey: 'a',
        evidenceRevision: 'r',
        decision: 'maybe',
      })
    );
    expect(badDecision.status).toBe(400);

    const longCorrection = await POST(
      post({
        dedupeKey: 'k',
        action: 'review_evidence',
        evidenceKey: 'a',
        evidenceRevision: 'r',
        decision: 'no',
        correction: 'x'.repeat(501),
      })
    );
    expect(longCorrection.status).toBe(400);
  });

  it('records evidence reviews and returns the refreshed inspection', async () => {
    mocks.getByKey.mockResolvedValue(CONTACT);
    mocks.review.mockResolvedValue({ ok: true });
    mocks.inspect.mockResolvedValue({ status: 'needs_review', items: [] });

    const res = await POST(
      post({
        dedupeKey: 'k',
        action: 'review_evidence',
        evidenceKey: 'dsp:1',
        evidenceRevision: 'rev1',
        decision: 'yes',
      })
    );
    expect(res.status).toBe(200);
    expect(mocks.review).toHaveBeenCalledWith(
      expect.objectContaining({
        evidenceKey: 'dsp:1',
        evidenceRevision: 'rev1',
        decision: 'yes',
        actorUserId: 'f1',
      })
    );
  });

  it('maps stale reviews to 409', async () => {
    mocks.getByKey.mockResolvedValue(CONTACT);
    mocks.review.mockResolvedValue({ ok: false, reason: 'stale' });
    const res = await POST(
      post({
        dedupeKey: 'k',
        action: 'review_evidence',
        evidenceKey: 'dsp:1',
        evidenceRevision: 'rev1',
        decision: 'no',
      })
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'stale' });
  });

  it('requires a revision and certifies the profile', async () => {
    mocks.getByKey.mockResolvedValue(CONTACT);
    const missing = await POST(
      post({ dedupeKey: 'k', action: 'certify_profile' })
    );
    expect(missing.status).toBe(400);

    mocks.certify.mockResolvedValue({ ok: true });
    mocks.inspect.mockResolvedValue({
      status: 'certified_for_outreach',
      items: [],
    });
    const res = await POST(
      post({
        dedupeKey: 'k',
        action: 'certify_profile',
        evidenceRevision: 'r1',
      })
    );
    expect(res.status).toBe(200);
    expect(mocks.certify).toHaveBeenCalledWith(
      expect.objectContaining({ evidenceRevision: 'r1', actorUserId: 'f1' })
    );
    const body = await res.json();
    expect(body.certification.status).toBe('certified_for_outreach');
  });
});
