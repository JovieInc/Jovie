import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  db: vi.fn(),
  enqueue: vi.fn(),
  send: vi.fn(),
}));

vi.mock('@/lib/ovie/privacy-lock/access', () => ({
  requireOvieApiAccess: mocks.access,
}));
vi.mock('@/lib/db', () => ({
  db: { select: mocks.db, insert: mocks.db, update: mocks.db },
}));
vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: mocks.db,
}));
vi.mock('@/lib/email/jobs/enqueue', () => ({
  enqueueClaimInviteJob: mocks.enqueue,
}));
vi.mock('@/lib/notifications/providers/resend', () => ({
  ResendEmailProvider: class {
    sendEmail = mocks.send;
  },
}));

import { POST } from '@/app/api/admin/creator-invite/route';
import { processSendClaimInviteJob } from '@/lib/email/jobs/send-claim-invite';
import { isColdClaimInviteSendOpen } from '@/lib/outbound/cold-claim-invites';

const PROFILE = '00000000-0000-4000-8000-000000000001';
const INVITE = '00000000-0000-4000-8000-000000000002';

describe('cold claim invites stay closed until routed through Outbound approval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue(null);
  });

  it('is closed', () => {
    expect(isColdClaimInviteSendOpen()).toBe(false);
  });

  it('refuses to send a single invite before touching data', async () => {
    const response = await POST(
      new Request('https://jov.ie/api/admin/creator-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creatorProfileId: PROFILE,
          email: 'artist@example.com',
        }),
      })
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'COLD_OUTBOUND_CLOSED',
    });
    expect(mocks.db).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it('skips an already-queued job without reading or sending anything', async () => {
    const tx = { select: mocks.db, update: mocks.db };
    await expect(
      processSendClaimInviteJob(tx as never, {
        inviteId: INVITE,
        creatorProfileId: PROFILE,
      })
    ).resolves.toMatchObject({ status: 'skipped', inviteId: INVITE });
    expect(mocks.db).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
