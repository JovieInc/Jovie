import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptPII } from '@/lib/utils/pii-encryption';
import { processWaitlistEmailJob } from '@/lib/waitlist/email-jobs';
import { hashWaitlistInviteToken } from '@/lib/waitlist/tokens';

const mockSendNotification = vi.hoisted(() => vi.fn());

vi.mock('@/lib/notifications/service', () => ({
  sendNotification: mockSendNotification,
}));

function createTxMock(entryRows: Array<Record<string, unknown>>) {
  const updateSet = vi.fn(() => ({
    where: vi.fn().mockResolvedValue(undefined),
  }));
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        for: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue(entryRows),
        })),
      })),
    })),
  }));

  return {
    tx: {
      select,
      update: vi.fn(() => ({ set: updateSet })),
    } as unknown as Parameters<typeof processWaitlistEmailJob>[0],
    updateSet,
  };
}

describe('processWaitlistEmailJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('decrypts the queued invite token and scrubs it after send', async () => {
    mockSendNotification.mockResolvedValue({
      results: [{ channel: 'email', status: 'sent', detail: 'message-id' }],
    });
    const inviteToken = 'retry-token-with-enough-entropy-for-the-test-fixture';
    const encryptedInviteToken = encryptPII(inviteToken);
    expect(encryptedInviteToken).toBeTruthy();
    const { tx, updateSet } = createTxMock([
      {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'creator@example.com',
        fullName: 'Creator',
        status: 'invited',
        waitlistEmailSentAt: null,
        inviteEmailSentAt: null,
        inviteTokenHash: hashWaitlistInviteToken(inviteToken),
        inviteTokenExpiresAt: new Date(Date.now() + 60_000),
      },
    ]);

    const result = await processWaitlistEmailJob(
      tx,
      {
        entryId: '11111111-1111-4111-8111-111111111111',
        type: 'approval_invite',
        encryptedInviteToken: encryptedInviteToken ?? '',
      },
      {
        jobId: 'job-1',
      }
    );

    expect(result.status).toBe('sent');
    const tokenHashWrites = updateSet.mock.calls.filter(([value]) =>
      Object.hasOwn(value as object, 'inviteTokenHash')
    );
    expect(tokenHashWrites).toHaveLength(0);
    expect(mockSendNotification).toHaveBeenCalledOnce();
    expect(mockSendNotification.mock.calls[0]?.[0].text).toContain(
      `token=${inviteToken}`
    );
    expect(mockSendNotification.mock.calls[0]?.[0].idempotencyKey).toBe(
      `waitlist_invite:11111111-1111-4111-8111-111111111111:${hashWaitlistInviteToken(inviteToken)}`
    );
    expect(updateSet).toHaveBeenCalledWith({
      payload: {
        entryId: '11111111-1111-4111-8111-111111111111',
        type: 'approval_invite',
        force: false,
      },
      updatedAt: expect.any(Date),
    });
  });

  it('fails a legacy retry that has only a hashed token so the failure stays visible', async () => {
    const { tx } = createTxMock([
      {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'creator@example.com',
        fullName: 'Creator',
        status: 'invited',
        waitlistEmailSentAt: null,
        inviteEmailSentAt: null,
        inviteTokenHash: 'existing-token-hash',
        inviteTokenExpiresAt: new Date(Date.now() + 60_000),
      },
    ]);

    await expect(
      processWaitlistEmailJob(tx, {
        entryId: '11111111-1111-4111-8111-111111111111',
        type: 'approval_invite',
      })
    ).rejects.toThrow('Approval invite token already issued');
    expect(mockSendNotification).not.toHaveBeenCalled();
  });
});
