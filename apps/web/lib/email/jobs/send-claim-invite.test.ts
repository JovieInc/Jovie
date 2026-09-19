import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { requireCompleteness, sendEmail, generateToken, select } = vi.hoisted(
  () => ({
    requireCompleteness: vi.fn(),
    sendEmail: vi.fn(),
    generateToken: vi.fn(),
    select: vi.fn(),
  })
);
vi.mock('@/lib/db', () => ({ db: { select } }));
vi.mock('@/lib/profile/completeness.server', () => ({
  requireProfileCompleteness: requireCompleteness,
}));
vi.mock('@/lib/security/claim-token', () => ({
  generateClaimTokenPair: generateToken,
}));
vi.mock('@/lib/notifications/providers/resend', () => ({
  ResendEmailProvider: class {
    sendEmail = sendEmail;
  },
}));
vi.mock('@/lib/notifications/suppression', () => ({
  isEmailSuppressed: vi.fn().mockResolvedValue({ suppressed: false }),
}));
vi.mock('@/lib/email/campaigns/enrollment', () => ({
  enrollInCampaign: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/email/templates/claim-invite', () => ({
  getClaimInviteEmail: () => ({
    subject: 'Claim your page',
    text: 'Synthetic message',
    html: '<p>Synthetic message</p>',
  }),
}));
vi.mock('@/lib/notifications/sender-policy', () => ({
  formatFounderSender: () => 'Jovie <hello@jov.ie>',
  getSenderPolicy: () => ({ replyToEmail: 'hello@jov.ie' }),
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

import type { DbOrTransaction } from '@/lib/db';
import { processSendClaimInviteJob } from './send-claim-invite';

const profileId = '11111111-1111-4111-8111-111111111111';
const inviteId = '22222222-2222-4222-8222-222222222222';
describe('claim invitation completeness boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    select.mockReturnValue({
      from: () => ({
        where: () => ({ limit: async () => [{ campaignsEnabled: true }] }),
      }),
    });
    generateToken.mockResolvedValue({
      token: 'token',
      tokenHash: 'hash',
      expiresAt: new Date(),
    });
    sendEmail.mockResolvedValue({ status: 'sent', messageId: 'message-1' });
  });
  function session() {
    const limit = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: inviteId,
          creatorProfileId: profileId,
          email: 'river@example.com',
          status: 'pending',
          meta: {},
        },
      ])
      .mockResolvedValueOnce([
        {
          id: profileId,
          username: 'riverlane',
          displayName: 'River Lane',
          isClaimed: false,
          avatarUrl: 'https://cdn.jov.ie/river.jpg',
          fitScore: 90,
        },
      ]);
    return {
      select: vi.fn(() => ({ from: () => ({ where: () => ({ limit }) }) })),
      update: vi.fn(() => ({ set: () => ({ where: async () => undefined }) })),
    };
  }
  it('never rotates a claim token or contacts Resend without current certification', async () => {
    requireCompleteness.mockRejectedValue(
      new Error('Profile completeness certification required before outreach')
    );
    const tx = session();
    await expect(
      processSendClaimInviteJob(tx as unknown as DbOrTransaction, {
        inviteId,
        creatorProfileId: profileId,
      })
    ).rejects.toThrow('certification required');
    expect(requireCompleteness).toHaveBeenCalledWith(profileId, tx);
    expect(generateToken).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });
  it('preserves the existing send path after a valid certification', async () => {
    requireCompleteness.mockResolvedValue(undefined);
    const result = await processSendClaimInviteJob(
      session() as unknown as DbOrTransaction,
      { inviteId, creatorProfileId: profileId }
    );
    expect(result.status).toBe('sent');
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(requireCompleteness.mock.invocationCallOrder[0]).toBeLessThan(
      sendEmail.mock.invocationCallOrder[0]
    );
  });
});
