import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  approve: vi.fn(),
  save: vi.fn(),
  decide: vi.fn(),
  queue: vi.fn(),
}));

vi.mock('@/lib/ovie/privacy-lock/access', () => ({
  getOvieOperatorEntitlements: mocks.access,
}));
vi.mock('@/lib/outbound/detail.server', () => ({
  approveOutbound: mocks.approve,
  saveOutboundCopy: mocks.save,
  decideOutboundTarget: mocks.decide,
  getOutboundCertification: vi.fn(),
  loadOutboundLead: vi.fn(),
}));
vi.mock('@/lib/outbound/queue.server', () => ({
  getOutboundQueue: mocks.queue,
}));

import { GET, POST } from '@/app/api/admin/outbound/route';

const LEAD_A = '00000000-0000-4000-8000-00000000000a';
const LEAD_B = '00000000-0000-4000-8000-00000000000b';
const REV = 'c'.repeat(64);
const COPY = {
  channel: 'email',
  subject: 'Hi',
  body: 'Hey https://jov.ie/claim/t',
};

function post(body: unknown) {
  return POST(
    new Request('https://jov.ie/api/admin/outbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

describe('/api/admin/outbound', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: true,
      userId: 'tim',
    });
    mocks.approve.mockResolvedValue({ ok: true });
    mocks.save.mockResolvedValue({ ok: true });
    mocks.decide.mockResolvedValue({ ok: true });
  });

  it('denies non-admins before reading the queue', async () => {
    mocks.access.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: false,
      userId: 'someone',
    });
    const response = await GET(
      new Request('https://jov.ie/api/admin/outbound')
    );
    expect(response.status).toBe(403);
    expect(mocks.queue).not.toHaveBeenCalled();
  });

  it('approves one person and one exact message as the signed-in founder', async () => {
    const response = await post({
      action: 'approve',
      leadId: LEAD_A,
      expectedTargetRevision: REV,
      copy: COPY,
      actorUserId: 'spoofed',
    });
    expect(response.status).toBe(200);
    expect(mocks.approve).toHaveBeenCalledWith({
      leadId: LEAD_A,
      expectedTargetRevision: REV,
      copy: COPY,
      actorUserId: 'tim',
    });
  });

  it('has no bulk approval', async () => {
    const response = await post({
      action: 'approve',
      items: [
        { leadId: LEAD_A, expectedTargetRevision: REV },
        { leadId: LEAD_B, expectedTargetRevision: REV },
      ],
      copy: COPY,
    });
    expect(response.status).toBe(400);
    expect(mocks.approve).not.toHaveBeenCalled();
  });

  it('explains a refused approval', async () => {
    mocks.approve.mockResolvedValue({ ok: false, reason: 'not_certified' });
    const response = await post({
      action: 'approve',
      leadId: LEAD_A,
      expectedTargetRevision: REV,
      copy: COPY,
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'Certify the current profile facts before approving outreach.',
      reason: 'not_certified',
    });
  });

  it('records bulk rejects one decision per person with the learning reason', async () => {
    mocks.decide
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, reason: 'stale_target' });
    const response = await post({
      action: 'reject',
      reason: 'has_team',
      items: [
        { leadId: LEAD_A, expectedTargetRevision: REV },
        { leadId: LEAD_B, expectedTargetRevision: REV },
      ],
    });
    expect(response.status).toBe(207);
    expect(mocks.decide).toHaveBeenCalledTimes(2);
    expect(mocks.decide).toHaveBeenNthCalledWith(1, {
      leadId: LEAD_A,
      expectedTargetRevision: REV,
      action: 'reject',
      reason: 'has_team',
      note: null,
      actorUserId: 'tim',
    });
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      results: [
        { leadId: LEAD_A, ok: true },
        { leadId: LEAD_B, ok: false, reason: 'stale_target' },
      ],
    });
  });

  it('requires a reason to reject', async () => {
    const response = await post({
      action: 'reject',
      items: [{ leadId: LEAD_A, expectedTargetRevision: REV }],
    });
    expect(response.status).toBe(400);
  });
});
