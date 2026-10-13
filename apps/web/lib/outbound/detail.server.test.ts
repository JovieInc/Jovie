import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  lead: null as Record<string, unknown> | null,
  record: vi.fn(),
  contact: vi.fn(),
  inspection: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (mocks.lead ? [mocks.lead] : []),
        }),
      }),
    }),
  },
}));
vi.mock('./ledger.server', () => ({ recordOutboundDecision: mocks.record }));
vi.mock('@/lib/admin/contacts', () => ({
  getCanonicalContactByKey: mocks.contact,
}));
vi.mock('@/lib/admin/contact-certification', () => ({
  getContactCertificationInspection: mocks.inspection,
}));

import {
  approveOutbound,
  decideOutboundTarget,
  getOutboundCertification,
  saveOutboundCopy,
} from './detail.server';

const LEAD = {
  id: 'lead-1',
  linktreeHandle: 'ada',
  displayName: 'Ada',
  contactEmail: 'ada@example.com',
  instagramHandle: null,
  creatorProfileId: 'profile-1',
  claimToken: 'tok',
  avatarUrl: null,
};
const COPY = { channel: 'email' as const, subject: 'Hi', body: 'link' };
const INPUT = {
  leadId: 'lead-1',
  expectedTargetRevision: 'rev',
  copy: COPY,
  actorUserId: 'tim',
};

describe('outbound decisions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lead = { ...LEAD };
    mocks.record.mockResolvedValue({ ok: true, revision: 'r' });
    mocks.contact.mockResolvedValue({ dedupeKey: 'email:ada@example.com' });
    mocks.inspection.mockResolvedValue({ status: 'certified_for_outreach' });
  });

  it('looks up the canonical contact by email, then handle', async () => {
    await getOutboundCertification(LEAD);
    expect(mocks.contact).toHaveBeenCalledWith('email:ada@example.com');
    await getOutboundCertification({ ...LEAD, contactEmail: null });
    expect(mocks.contact).toHaveBeenLastCalledWith('handle:ada');
    mocks.contact.mockResolvedValue(null);
    await expect(getOutboundCertification(LEAD)).resolves.toBeNull();
  });

  it('approves the target, then the exact copy, as the founder', async () => {
    await expect(approveOutbound(INPUT)).resolves.toEqual({
      ok: true,
      revision: 'r',
    });
    expect(mocks.record.mock.calls.map(([call]) => call.decision)).toEqual([
      { kind: 'target', decision: 'yes', expectedTargetRevision: 'rev' },
      {
        kind: 'copy',
        decision: 'yes',
        expectedTargetRevision: 'rev',
        copy: COPY,
      },
    ]);
    expect(mocks.record.mock.calls[0][0].actorUserId).toBe('tim');
  });

  it('refuses approval before the facts are certified', async () => {
    mocks.inspection.mockResolvedValue({ status: 'needs_review' });
    await expect(approveOutbound(INPUT)).resolves.toEqual({
      ok: false,
      reason: 'not_certified',
    });
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it('refuses a channel the person cannot be reached on, or a missing lead', async () => {
    await expect(
      approveOutbound({ ...INPUT, copy: { ...COPY, channel: 'dm' } })
    ).resolves.toEqual({ ok: false, reason: 'no_channel' });
    mocks.lead = null;
    await expect(approveOutbound(INPUT)).resolves.toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('stops before the copy when the target write is refused', async () => {
    mocks.record.mockResolvedValueOnce({ ok: false, reason: 'stale_target' });
    await expect(approveOutbound(INPUT)).resolves.toEqual({
      ok: false,
      reason: 'stale_target',
    });
    expect(mocks.record).toHaveBeenCalledTimes(1);
  });

  it('saves edits as an unapproved draft', async () => {
    await saveOutboundCopy(INPUT);
    expect(mocks.record.mock.calls[0][0].decision).toMatchObject({
      kind: 'copy',
      decision: 'unsure',
    });
  });

  it('maps hold to unsure and reject to no with its reason', async () => {
    const base = {
      leadId: 'lead-1',
      expectedTargetRevision: 'rev',
      note: null,
      actorUserId: 'tim',
    };
    await decideOutboundTarget({ ...base, action: 'hold', reason: null });
    await decideOutboundTarget({
      ...base,
      action: 'reject',
      reason: 'too_big',
    });
    expect(mocks.record.mock.calls.map(([call]) => call.decision)).toEqual([
      expect.objectContaining({ decision: 'unsure', reason: null }),
      expect.objectContaining({ decision: 'no', reason: 'too_big' }),
    ]);
  });
});
