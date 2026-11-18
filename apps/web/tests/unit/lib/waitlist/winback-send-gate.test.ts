import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WINBACK_EMAIL_TEMPLATE_VERSION } from '@/lib/waitlist/winback';
import { processWaitlistWinbackEmailJob } from '@/lib/waitlist/winback-email-job';

// ---------------------------------------------------------------------------
// Send-path impossibility: without an approval record NOTHING can send.
// ---------------------------------------------------------------------------

const mockSendNotification = vi.hoisted(() => vi.fn());
vi.mock('@/lib/notifications/service', () => ({
  sendNotification: mockSendNotification,
}));

const mockGetApproval = vi.hoisted(() => vi.fn());
const mockGetLastUnanswered = vi.hoisted(() => vi.fn());
vi.mock('@/lib/waitlist/winback-approval.server', () => ({
  getWinbackApprovalRecord: mockGetApproval,
  getLastUnansweredWinbackSentAt: mockGetLastUnanswered,
}));

const ENTRY_ID = '11111111-1111-4111-8111-111111111111';
const FROZEN_NOW = new Date('2026-11-13T12:00:00.000Z');

const APPROVAL_RECORD = {
  contract: 'jovie.winback-approval/v1',
  batchId: 'batch-2026-11-09-a',
  capabilityKey: 'public-profile-pages',
  templateVersion: WINBACK_EMAIL_TEMPLATE_VERSION,
  entryIds: [ENTRY_ID],
  approvedBy: 'tim',
  approvedAt: '2026-11-09T12:00:00.000Z',
};

function createEntryTxMock() {
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue([
          {
            id: ENTRY_ID,
            email: 'creator@example.com',
            fullName: 'Creator',
            status: 'waitlisted',
            waitlistEmailSentAt: null,
            inviteEmailSentAt: null,
            inviteTokenHash: null,
            inviteTokenExpiresAt: null,
          },
        ]),
        for: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: ENTRY_ID,
              email: 'creator@example.com',
              fullName: 'Creator',
              status: 'waitlisted',
              waitlistEmailSentAt: null,
              inviteEmailSentAt: null,
              inviteTokenHash: null,
              inviteTokenExpiresAt: null,
            },
          ]),
        })),
      })),
    })),
  }));
  return { tx: { select } as never, select };
}

function winbackPayload(overrides: Record<string, unknown> = {}) {
  return {
    entryId: ENTRY_ID,
    type: 'winback_capability_shipped',
    capabilityKey: 'public-profile-pages',
    capabilityLabel: 'tour dates',
    wants: ['sell vinyl', 'tour dates'],
    handle: 'moonrunner',
    batchId: 'batch-2026-11-09-a',
    cohort: 'waitlisted',
    origin: 'https://jov.ie',
    templateVersion: WINBACK_EMAIL_TEMPLATE_VERSION,
    encryptedResumeToken: 'x'.repeat(40),
    ...overrides,
  };
}

describe('processWaitlistWinbackEmailJob winback_capability_shipped', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('NEVER sends without an approval record', async () => {
    mockGetApproval.mockResolvedValue(undefined);
    const { tx } = createEntryTxMock();

    const result = await processWaitlistWinbackEmailJob(tx, winbackPayload());

    expect(result.status).toBe('skipped');
    expect(result.detail).toMatch(/no valid approval record/);
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('NEVER sends when the approval record does not list the entry', async () => {
    mockGetApproval.mockResolvedValue(APPROVAL_RECORD);
    mockGetLastUnanswered.mockResolvedValue(null);
    const { tx } = createEntryTxMock();

    const result = await processWaitlistWinbackEmailJob(
      tx,
      winbackPayload({ entryId: '22222222-2222-4222-8222-222222222222' })
    );

    // The payload entry is not in the approved batch — refused before any
    // entry is even locked.
    expect(result.status).toBe('skipped');
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('NEVER sends within the 14-day unanswered budget (JOV-6655)', async () => {
    mockGetApproval.mockResolvedValue(APPROVAL_RECORD);
    mockGetLastUnanswered.mockResolvedValue(
      new Date(FROZEN_NOW.getTime() - 24 * 60 * 60 * 1000)
    );
    const { tx } = createEntryTxMock();

    const result = await processWaitlistWinbackEmailJob(tx, winbackPayload(), {
      now: FROZEN_NOW,
    });

    expect(result.status).toBe('skipped');
    expect(result.detail).toMatch(/JOV-6655/);
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('sends exactly once with the founder-locked copy when approved', async () => {
    mockGetApproval.mockResolvedValue(APPROVAL_RECORD);
    mockGetLastUnanswered.mockResolvedValue(null);
    mockSendNotification.mockResolvedValue({
      results: [{ channel: 'email', status: 'sent', detail: 'message-id' }],
    });
    const { tx } = createEntryTxMock();

    const result = await processWaitlistWinbackEmailJob(tx, winbackPayload());

    expect(result.status).toBe('sent');
    expect(mockSendNotification).toHaveBeenCalledOnce();
    const message = mockSendNotification.mock.calls[0]?.[0];
    expect(message.text).toContain(
      "You reached out wanting to sell vinyl and tour dates. We weren't ready then."
    );
    expect(message.text).toContain('We just shipped tour dates');
    expect(message.text).toContain(
      'Your handle jov.ie/moonrunner is still yours:'
    );
    expect(message.text).toContain('/start?resume=winback&w=');
  });

  it('throws on an invalid payload (empty wants) without sending', async () => {
    mockGetApproval.mockResolvedValue(APPROVAL_RECORD);
    mockGetLastUnanswered.mockResolvedValue(null);
    const { tx } = createEntryTxMock();

    await expect(
      processWaitlistWinbackEmailJob(tx, winbackPayload({ wants: [] }))
    ).rejects.toThrow(/Invalid winback email job payload/);
    expect(mockSendNotification).not.toHaveBeenCalled();
  });
});
