import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  selects: [] as unknown[][],
  sets: [] as Array<Record<string, unknown>>,
  suppressed: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    }),
  },
}));
vi.mock('@/lib/db/schema/admin', () => ({ campaignSettings: {} }));
vi.mock('@/lib/db/schema/profiles', () => ({
  creatorClaimInvites: {},
  creatorProfiles: {},
}));
vi.mock('@/lib/email/campaigns/enrollment', () => ({
  enrollInCampaign: vi.fn(),
}));
vi.mock('@/lib/email/templates/claim-invite', () => ({
  getClaimInviteEmail: vi.fn(() => {
    throw new Error('stop after rotation');
  }),
}));
vi.mock('@/lib/notifications/providers/resend', () => ({
  ResendEmailProvider: class {},
}));
vi.mock('@/lib/notifications/sender-policy', () => ({
  formatFounderSender: vi.fn(),
  getSenderPolicy: vi.fn(),
}));
vi.mock('@/lib/notifications/suppression', () => ({
  isEmailSuppressed: hoisted.suppressed,
}));
vi.mock('@/lib/outbound/cold-claim-invites', () => ({
  COLD_CLAIM_INVITE_CLOSED_MESSAGE: 'closed',
  isColdClaimInviteSendOpen: () => true,
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { processSendClaimInviteJob } from '@/lib/email/jobs/send-claim-invite';

const IDS = {
  inviteId: '123e4567-e89b-12d3-a456-426614174001',
  creatorProfileId: '123e4567-e89b-12d3-a456-426614174002',
};

function makeTx() {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => hoisted.selects.shift() ?? [],
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        hoisted.sets.push(values);
        return { where: async () => undefined };
      },
    }),
  };
}

describe('claim invite token rotation', () => {
  beforeEach(() => {
    hoisted.sets.length = 0;
    hoisted.selects.length = 0;
    hoisted.selects.push(
      [
        {
          id: IDS.inviteId,
          email: 'artist@example.com',
          status: 'pending',
          creatorProfileId: IDS.creatorProfileId,
          meta: {},
        },
      ],
      [
        {
          id: IDS.creatorProfileId,
          username: 'artist',
          displayName: 'Artist',
          avatarUrl: null,
          isClaimed: false,
          claimToken: 'existing-hash',
          fitScore: null,
        },
      ]
    );
  });

  it('does not rotate the profile token for a suppressed recipient', async () => {
    hoisted.suppressed.mockResolvedValue({
      suppressed: true,
      reason: 'unsubscribed',
    });

    const result = await processSendClaimInviteJob(makeTx() as never, IDS);

    expect(result.status).toBe('skipped');
    expect(hoisted.sets.some(values => 'claimToken' in values)).toBe(false);
  });

  it('rotates the profile token only when the send proceeds', async () => {
    hoisted.suppressed.mockResolvedValue({ suppressed: false });

    await expect(
      processSendClaimInviteJob(makeTx() as never, IDS)
    ).rejects.toThrow('stop after rotation');

    expect(hoisted.sets.some(values => 'claimToken' in values)).toBe(true);
  });
});
