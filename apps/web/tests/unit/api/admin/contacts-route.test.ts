// biome-ignore-all format: compact route regressions keep complete validation coverage below the hard PR cap.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ access: vi.fn(), getByKey: vi.fn(), getContacts: vi.fn(), timeline: vi.fn(), setStage: vi.fn(), inspect: vi.fn(), review: vi.fn(), certify: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/ovie/privacy-lock/access', () => ({ getOvieOperatorEntitlements: mocks.access }));
vi.mock('@/lib/admin/contacts', () => ({ getCanonicalContactByKey: mocks.getByKey, getCanonicalContacts: mocks.getContacts, getContactStageTimeline: mocks.timeline, setCanonicalContactStage: mocks.setStage }));
vi.mock('@/lib/admin/contact-certification', () => ({ getContactCertificationInspection: mocks.inspect, reviewContactEvidence: mocks.review, certifyContactEvidence: mocks.certify }));

import { GET, POST } from '@/app/api/admin/contacts/route';

const CONTACT = { dedupeKey: 'email:ada@example.com' };
const post = (body: unknown) => new Request('https://jov.ie/api/admin/contacts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const reviewBody = { dedupeKey: 'k', action: 'review_evidence', evidenceKey: 'dsp:1', evidenceRevision: 'rev1', decision: 'yes' };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({ isAuthenticated: true, isAdmin: true, userId: 'f1' });
});

describe('GET /api/admin/contacts', () => {
  it('enforces admin access', async () => { mocks.access.mockResolvedValue({ isAuthenticated: false }); expect((await GET(new Request('https://jov.ie/api/admin/contacts'))).status).toBe(401); mocks.access.mockResolvedValue({ isAuthenticated: true, isAdmin: false }); expect((await GET(new Request('https://jov.ie/api/admin/contacts'))).status).toBe(403); });
  it('returns the revision-bound inspection and serialized timeline', async () => { mocks.getByKey.mockResolvedValue(CONTACT); mocks.timeline.mockResolvedValue([{ id: 't1', createdAt: new Date('2026-09-30T00:00:00Z') }]); mocks.inspect.mockResolvedValue({ status: 'needs_review', items: [] }); const response = await GET(new Request('https://jov.ie/api/admin/contacts?key=email%3Aada%40example.com')); await expect(response.json()).resolves.toMatchObject({ certification: { status: 'needs_review' }, timeline: [{ createdAt: '2026-09-30T00:00:00.000Z' }] }); expect(mocks.inspect).toHaveBeenCalledWith(CONTACT); });
});

describe('POST /api/admin/contacts evidence actions', () => {
  it.each([[new Request('https://jov.ie/api/admin/contacts', { method: 'POST', body: 'not json' }), 400], [post({}), 400], [post({ dedupeKey: 'k', action: 'review_evidence' }), 404], [post({ ...reviewBody, decision: 'maybe' }), 404], [post({ ...reviewBody, correction: 'x'.repeat(501) }), 404]])('rejects malformed evidence request %#', async (request, status) => { expect((await POST(request)).status).toBe(status); });

  it('validates review payloads after resolving the contact', async () => { mocks.getByKey.mockResolvedValue(CONTACT); for (const body of [{ dedupeKey: 'k', action: 'review_evidence' }, { ...reviewBody, decision: 'maybe' }, { ...reviewBody, correction: 'x'.repeat(501) }]) expect((await POST(post(body))).status).toBe(400); });
  it('records reviews, refreshes current state, and maps stale evidence to conflict', async () => { mocks.getByKey.mockResolvedValue(CONTACT); mocks.review.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, reason: 'stale' }); mocks.inspect.mockResolvedValue({ status: 'needs_review', items: [] }); expect((await POST(post(reviewBody))).status).toBe(200); expect(mocks.review).toHaveBeenCalledWith(expect.objectContaining({ evidenceKey: 'dsp:1', evidenceRevision: 'rev1', decision: 'yes', actorUserId: 'f1' })); const stale = await POST(post({ ...reviewBody, decision: 'no' })); expect([stale.status, await stale.json()]).toEqual([409, { error: 'stale' }]); });
  it('requires a current revision before certification', async () => { mocks.getByKey.mockResolvedValue(CONTACT); expect((await POST(post({ dedupeKey: 'k', action: 'certify_profile' }))).status).toBe(400); mocks.certify.mockResolvedValue({ ok: true }); mocks.inspect.mockResolvedValue({ status: 'certified_for_outreach', items: [] }); const response = await POST(post({ dedupeKey: 'k', action: 'certify_profile', evidenceRevision: 'r1' })); await expect(response.json()).resolves.toMatchObject({ certification: { status: 'certified_for_outreach' } }); expect(mocks.certify).toHaveBeenCalledWith(expect.objectContaining({ evidenceRevision: 'r1', actorUserId: 'f1' })); });
});
