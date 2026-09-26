import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decryptPII, encryptPII } from '@/lib/utils/pii-encryption';
import {
  enqueueWaitlistApprovalInviteEmail,
  processWaitlistEmailJob,
} from '@/lib/waitlist/email-jobs';
import { hashWaitlistInviteToken } from '@/lib/waitlist/tokens';

const mockSendNotification = vi.hoisted(() => vi.fn());

vi.mock('@/lib/notifications/service', () => ({
  sendNotification: mockSendNotification,
}));

// PII encryption derives its key via scrypt with a deliberately expensive
// work factor (N=2^17). Pre-derive it once and stub scryptSync so the
// real-encryption tests below exercise real AES-256-GCM encrypt/decrypt
// without paying the key-derivation cost on every call (mirrors
// tests/lib/analytics/pii-encryption.test.ts).
const FAST_TEST_KEY = crypto.randomBytes(32);
const originalScryptSync = crypto.scryptSync.bind(crypto);
vi.spyOn(crypto, 'scryptSync').mockImplementation((...args: unknown[]) => {
  if (args[1] === 'jovie-pii-salt' && args[2] === 32) {
    return FAST_TEST_KEY;
  }
  return originalScryptSync(...(args as Parameters<typeof crypto.scryptSync>));
});

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

// -----------------------------------------------------------------------
// issueWaitlistInviteToken (private) via enqueueWaitlistApprovalInviteEmail
// -----------------------------------------------------------------------
//
// This is the *issuance* path (admin approves an entry / resends an invite),
// as opposed to `processWaitlistEmailJob` above which is the *consumer* path
// (the queued job actually sending the email). Every real call site
// (admin approve route, admin resend-invite route, auto-accept) mocks
// `enqueueWaitlistApprovalInviteEmail` away entirely, so the token
// generation / reissuance / persistence / encryption logic here has zero
// real coverage without these tests.

const ENTRY_ID = '22222222-2222-4222-8222-222222222222';
const TEST_ENCRYPTION_KEY = 'test-key-for-encryption-32-chars!';

interface FakeEntryRow {
  id: string;
  status: string;
  inviteTokenHash: string | null;
  inviteTokenExpiresAt: Date | null;
}

function createIssueTokenTxMock(entryRow: FakeEntryRow | undefined) {
  const updateCalls: Array<Record<string, unknown>> = [];
  const insertCalls: Array<Record<string, unknown>> = [];

  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        for: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue(entryRow ? [entryRow] : []),
        })),
      })),
    })),
  }));

  const update = vi.fn(() => ({
    set: vi.fn((values: Record<string, unknown>) => {
      updateCalls.push(values);
      return { where: vi.fn().mockResolvedValue(undefined) };
    }),
  }));

  const insert = vi.fn(() => ({
    values: vi.fn((values: Record<string, unknown>) => {
      insertCalls.push(values);
      return {
        onConflictDoNothing: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ id: 'job-abc123' }]),
        })),
      };
    }),
  }));

  const tx = { select, update, insert } as unknown as Parameters<
    typeof enqueueWaitlistApprovalInviteEmail
  >[0];

  return { tx, updateCalls, insertCalls };
}

describe('enqueueWaitlistApprovalInviteEmail (issueWaitlistInviteToken)', () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    originalKey = process.env.PII_ENCRYPTION_KEY;
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.PII_ENCRYPTION_KEY;
    } else {
      process.env.PII_ENCRYPTION_KEY = originalKey;
    }
    vi.useRealTimers();
  });

  it.each([
    'new',
    'chat_started',
    'qualified',
    'waitlisted',
    'claimed',
    'signed_up',
    'rejected',
    'expired',
    'blocked',
  ])('does not issue a token or enqueue an email for non-redeemable status %s', async status => {
    const { tx, updateCalls, insertCalls } = createIssueTokenTxMock({
      id: ENTRY_ID,
      status,
      inviteTokenHash: null,
      inviteTokenExpiresAt: null,
    });

    const result = await enqueueWaitlistApprovalInviteEmail(tx, ENTRY_ID);

    expect(result).toBeNull();
    expect(updateCalls).toHaveLength(0);
    expect(insertCalls).toHaveLength(0);
  });

  it('returns null and writes nothing when the entry does not exist', async () => {
    const { tx, updateCalls, insertCalls } = createIssueTokenTxMock(undefined);

    const result = await enqueueWaitlistApprovalInviteEmail(tx, ENTRY_ID);

    expect(result).toBeNull();
    expect(updateCalls).toHaveLength(0);
    expect(insertCalls).toHaveLength(0);
  });

  it('skips re-issuance when a still-valid unexpired token exists and force is not set', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const stillValidExpiry = new Date(now.getTime() + 1); // 1ms in the future
    const { tx, updateCalls, insertCalls } = createIssueTokenTxMock({
      id: ENTRY_ID,
      status: 'invited',
      inviteTokenHash: 'existing-hash',
      inviteTokenExpiresAt: stillValidExpiry,
    });

    const result = await enqueueWaitlistApprovalInviteEmail(tx, ENTRY_ID, {
      now,
    });

    expect(result).toBeNull();
    expect(updateCalls).toHaveLength(0);
    expect(insertCalls).toHaveLength(0);
  });

  it('reissues and enqueues when force=true even though a valid unexpired token exists', async () => {
    process.env.PII_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    const now = new Date('2026-01-01T00:00:00.000Z');
    const stillValidExpiry = new Date(now.getTime() + 1);
    const { tx, updateCalls, insertCalls } = createIssueTokenTxMock({
      id: ENTRY_ID,
      status: 'invited',
      inviteTokenHash: 'existing-hash',
      inviteTokenExpiresAt: stillValidExpiry,
    });

    const result = await enqueueWaitlistApprovalInviteEmail(tx, ENTRY_ID, {
      now,
      force: true,
    });

    expect(result).toBe('job-abc123');
    expect(updateCalls).toHaveLength(1);
    const updatePayload = updateCalls[0] as {
      inviteTokenHash: string;
      inviteTokenExpiresAt: Date;
      inviteTokenRedeemedAt: null;
      updatedAt: Date;
    };
    expect(updatePayload.inviteTokenHash).not.toBe('existing-hash');
    expect(updatePayload.inviteTokenExpiresAt).toEqual(
      new Date('2026-01-15T00:00:00.000Z')
    );
    expect(updatePayload.inviteTokenRedeemedAt).toBeNull();
    expect(updatePayload.updatedAt).toEqual(now);

    expect(insertCalls).toHaveLength(1);
    const jobPayload = insertCalls[0]?.payload as {
      entryId: string;
      type: string;
      encryptedInviteToken: string;
    };
    expect(jobPayload.entryId).toBe(ENTRY_ID);
    expect(jobPayload.type).toBe('approval_invite');

    // The token handed to the email job must be encrypted, not plaintext,
    // and must decrypt back to the raw token whose hash was just persisted.
    expect(jobPayload.encryptedInviteToken).not.toBe(
      updatePayload.inviteTokenHash
    );
    const decryptedToken = decryptPII(jobPayload.encryptedInviteToken);
    expect(decryptedToken).toBeTruthy();
    expect(jobPayload.encryptedInviteToken).not.toBe(decryptedToken);
    expect(hashWaitlistInviteToken(decryptedToken as string)).toBe(
      updatePayload.inviteTokenHash
    );
  });

  it('issues a new token and persists only the hash when none exists yet', async () => {
    process.env.PII_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    const now = new Date('2026-02-01T00:00:00.000Z');
    const { tx, updateCalls, insertCalls } = createIssueTokenTxMock({
      id: ENTRY_ID,
      status: 'approved',
      inviteTokenHash: null,
      inviteTokenExpiresAt: null,
    });

    const result = await enqueueWaitlistApprovalInviteEmail(tx, ENTRY_ID, {
      now,
    });

    expect(result).toBe('job-abc123');
    expect(updateCalls).toHaveLength(1);
    const updatePayload = updateCalls[0] as {
      inviteTokenHash: string;
      inviteTokenExpiresAt: Date;
    };
    expect(updatePayload.inviteTokenExpiresAt).toEqual(
      new Date('2026-02-15T00:00:00.000Z')
    );

    const jobPayload = insertCalls[0]?.payload as {
      encryptedInviteToken: string;
    };
    const decryptedToken = decryptPII(
      jobPayload.encryptedInviteToken
    ) as string;
    expect(decryptedToken).toBeTruthy();

    // Persisted DB value must be the hash, never the raw token.
    expect(updatePayload.inviteTokenHash).not.toBe(decryptedToken);
    expect(updatePayload.inviteTokenHash).toBe(
      hashWaitlistInviteToken(decryptedToken)
    );

    // dedupKey embeds the new token's hash, tying the enqueue to this issuance.
    expect(insertCalls[0]?.dedupKey).toBe(
      `waitlist_email:approval_invite:${ENTRY_ID}:token:${updatePayload.inviteTokenHash}`
    );
  });

  it('treats a token exactly at its expiry as expired and reissues', async () => {
    const now = new Date('2026-03-01T00:00:00.000Z');
    const { tx, updateCalls, insertCalls } = createIssueTokenTxMock({
      id: ENTRY_ID,
      status: 'invited',
      inviteTokenHash: 'old-hash',
      inviteTokenExpiresAt: new Date(now.getTime()), // exactly equal, not strictly greater
    });

    const result = await enqueueWaitlistApprovalInviteEmail(tx, ENTRY_ID, {
      now,
    });

    expect(result).toBe('job-abc123');
    expect(updateCalls).toHaveLength(1);
    expect(insertCalls).toHaveLength(1);
    const updatePayload = updateCalls[0] as { inviteTokenHash: string };
    expect(updatePayload.inviteTokenHash).not.toBe('old-hash');
  });

  it('treats a token past its expiry as expired and reissues', async () => {
    const now = new Date('2026-03-01T00:00:00.000Z');
    const { tx, updateCalls, insertCalls } = createIssueTokenTxMock({
      id: ENTRY_ID,
      status: 'invited',
      inviteTokenHash: 'old-hash',
      inviteTokenExpiresAt: new Date(now.getTime() - 1), // 1ms in the past
    });

    const result = await enqueueWaitlistApprovalInviteEmail(tx, ENTRY_ID, {
      now,
    });

    expect(result).toBe('job-abc123');
    expect(updateCalls).toHaveLength(1);
    expect(insertCalls).toHaveLength(1);
  });

  it('uses the current time when no now override is provided', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-01T00:00:00.000Z'));

    const { tx, updateCalls } = createIssueTokenTxMock({
      id: ENTRY_ID,
      status: 'invited',
      inviteTokenHash: null,
      inviteTokenExpiresAt: null,
    });

    await enqueueWaitlistApprovalInviteEmail(tx, ENTRY_ID);

    const updatePayload = updateCalls[0] as { inviteTokenExpiresAt: Date };
    expect(updatePayload.inviteTokenExpiresAt).toEqual(
      new Date('2026-04-15T00:00:00.000Z')
    );
  });
});
