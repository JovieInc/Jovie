import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDb,
  mockEq,
  mockRecordWorkflowRunOutcome,
  mockIsOutboundSmsEnabled,
  mockIsOutboundSmsConfigured,
  mockSendOutboundSms,
  mockIsPhoneSmsSuppressed,
  mockLogDelivery,
} = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
  },
  mockEq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  mockRecordWorkflowRunOutcome: vi.fn(),
  mockIsOutboundSmsEnabled: vi.fn(),
  mockIsOutboundSmsConfigured: vi.fn(),
  mockSendOutboundSms: vi.fn(),
  mockIsPhoneSmsSuppressed: vi.fn(),
  mockLogDelivery: vi.fn(),
}));

vi.mock('@/lib/connectors/workflows/outcome-attribution', () => ({
  recordWorkflowRunOutcome: mockRecordWorkflowRunOutcome,
}));

vi.mock('@/lib/notifications/providers/sms/outbound-sms', () => ({
  isOutboundSmsEnabled: mockIsOutboundSmsEnabled,
  isOutboundSmsConfigured: mockIsOutboundSmsConfigured,
  sendOutboundSms: mockSendOutboundSms,
}));

vi.mock('@/lib/notifications/sms-suppression', () => ({
  isPhoneSmsSuppressed: mockIsPhoneSmsSuppressed,
}));

vi.mock('@/lib/notifications/suppression', () => ({
  logDelivery: mockLogDelivery,
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  eq: mockEq,
  isNotNull: vi.fn(value => ({ isNotNull: value })),
  isNull: vi.fn(value => ({ isNull: value })),
  like: vi.fn((column: unknown, pattern: unknown) => ({ column, pattern })),
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('@/lib/env-public', () => ({
  publicEnv: {
    NEXT_PUBLIC_PROFILE_URL: 'https://jov.ie',
  },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import {
  approveDistributionDraft,
  buildDistributionDrafts,
} from './distribution-drafts';
import type { ReleaseToRevenueRunStepOutputs } from './types';
import { RELEASE_TO_REVENUE_WORKFLOW_KIND } from './types';

const baseStepOutputs: ReleaseToRevenueRunStepOutputs = {
  releaseId: 'release-1',
  triggerSource: 'catalog',
  triggeredAt: '2026-06-20T08:00:00.000Z',
  designPartner: {
    creatorUsername: 'timwhite',
    creatorProfileId: 'profile-1',
    userId: 'user-1',
    store: { provider: 'printful', scope: 'default' },
    socialAccount: { platform: 'instagram', handle: 'timwhite' },
    smsListId: 'design-partner-sms-fans',
  },
  release: {
    releaseId: 'release-1',
    title: 'Neon Sky',
    artworkUrl: null,
    slug: 'neon-sky',
    smartLinkPath: '/timwhite/neon-sky',
    links: [],
  },
};

/**
 * db.select is shared: the run lookup selects stepOutputs/status columns while
 * the consented-recipient lookup selects only `{ phone }`. Discriminate on the
 * selected columns so retries and repeat decisions stay deterministic.
 */
function mockOwnedRun(
  stepOutputs: ReleaseToRevenueRunStepOutputs,
  options: { readonly smsRecipients?: readonly string[] } = {}
) {
  const recipients = options.smsRecipients ?? [];
  mockDb.select.mockImplementation((cols: Record<string, unknown>) => ({
    from: vi.fn().mockImplementation(() => ({
      where: vi.fn().mockImplementation(() => ({
        limit: vi.fn().mockImplementation(() =>
          Promise.resolve(
            cols && Object.keys(cols).length === 1 && 'phone' in cols
              ? recipients.map(phone => ({ phone }))
              : [
                  {
                    id: 'run-1',
                    kind: RELEASE_TO_REVENUE_WORKFLOW_KIND,
                    userId: 'user-1',
                    status: 'waiting_for_approval',
                    stepOutputs,
                  },
                ]
          )
        ),
      })),
    })),
  }));
}

function mockPersistedRun(
  stepOutputs: ReleaseToRevenueRunStepOutputs,
  options: { readonly smsRecipients?: readonly string[] } = {}
) {
  mockOwnedRun(stepOutputs, options);

  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
  mockDb.update.mockReturnValue({ set: updateSet });

  return updateSet;
}

describe('distribution draft decisions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecordWorkflowRunOutcome.mockResolvedValue(null);
    mockIsOutboundSmsEnabled.mockReturnValue(true);
    mockIsOutboundSmsConfigured.mockReturnValue(true);
    mockSendOutboundSms.mockResolvedValue({
      success: true,
      providerMessageId: 'SM_test_1',
      status: 'queued',
    });
    mockIsPhoneSmsSuppressed.mockResolvedValue({
      suppressed: false,
      reason: null,
    });
    mockLogDelivery.mockResolvedValue(undefined);
  });

  it.each([1, 25, 26, 500])(
    'records all %i provider acceptances while retaining at most 25 message IDs',
    async recipientCount => {
      const drafts = buildDistributionDrafts({
        releaseTitle: 'Neon Sky',
        releaseLink: 'https://jov.ie/timwhite/neon-sky',
        merchDropLink: null,
        platform: 'instagram',
      });
      const smsDraft = drafts.items.find(item => item.channel === 'sms')!;
      const smsRecipients = Array.from(
        { length: recipientCount },
        (_, index) => `+1555000${String(index).padStart(4, '0')}`
      );
      const providerIds = smsRecipients.map((_, index) => `SM_test_${index}`);
      mockSendOutboundSms.mockImplementation(
        async ({ to }: { to: string }) => ({
          success: true,
          providerMessageId: providerIds[smsRecipients.indexOf(to)],
          status: 'queued',
        })
      );
      const updateSet = mockPersistedRun(
        { ...baseStepOutputs, distributionDrafts: drafts },
        { smsRecipients }
      );

      const result = await approveDistributionDraft({
        runId: 'run-1',
        draftId: smsDraft.id,
        userId: 'user-1',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(mockSendOutboundSms).toHaveBeenCalledTimes(recipientCount);
      for (const phone of smsRecipients) {
        expect(mockSendOutboundSms).toHaveBeenCalledWith({
          to: phone,
          body: smsDraft.body,
          metadata: {
            source: 'release_distribution',
            runId: 'run-1',
            draftId: smsDraft.id,
            idempotencyKey: `run-1:${smsDraft.id}`,
          },
        });
      }
      // A queued provider response is acceptance, not confirmed delivery.
      expect(result.draft.status).toBe('dispatched');
      expect(result.draft.dispatchedAt).toBeTruthy();
      expect(result.draft.delivery).toMatchObject({
        provider: 'twilio',
        state: 'accepted',
        attemptedRecipients: recipientCount,
        acceptedRecipients: recipientCount,
        suppressedRecipients: 0,
        providerMessageIds: providerIds.slice(0, 25),
        retryable: false,
      });
      expect(result.draft.delivery?.acceptedAt).toBeTruthy();
      expect(mockLogDelivery).toHaveBeenCalledTimes(recipientCount);
      expect(mockLogDelivery).toHaveBeenLastCalledWith(
        expect.objectContaining({ providerMessageId: providerIds.at(-1) })
      );
      const finalWrite = updateSet.mock.calls.at(-1)?.[0] as {
        stepOutputs: ReleaseToRevenueRunStepOutputs;
      };
      expect(finalWrite.stepOutputs.distributionDrafts?.items).toContainEqual(
        result.draft
      );
      expect(mockRecordWorkflowRunOutcome).not.toHaveBeenCalled();
    }
  );

  it.each([
    { error: 'Twilio request failed with HTTP 400', retryable: false },
    { error: 'Twilio request timed out', retryable: true },
  ])(
    'preserves partial acceptance and prevents approval replay after $error',
    async failure => {
      const drafts = buildDistributionDrafts({
        releaseTitle: 'Neon Sky',
        releaseLink: 'https://jov.ie/timwhite/neon-sky',
        merchDropLink: null,
        platform: 'instagram',
      });
      const smsDraft = drafts.items.find(item => item.channel === 'sms')!;
      const smsRecipients = Array.from(
        { length: 29 },
        (_, index) => `+1555000${String(index).padStart(4, '0')}`
      );
      mockIsPhoneSmsSuppressed.mockImplementation(async (phone: string) => ({
        suppressed: phone === smsRecipients[0],
        reason: phone === smsRecipients[0] ? 'user_unsubscribed' : null,
      }));
      mockSendOutboundSms.mockImplementation(async ({ to }: { to: string }) =>
        to === smsRecipients[1] || to === smsRecipients[28]
          ? { success: false, ...failure }
          : { success: true, providerMessageId: `SM_test_${to.slice(-4)}` }
      );
      const updateSet = mockPersistedRun(
        { ...baseStepOutputs, distributionDrafts: drafts },
        { smsRecipients }
      );

      const result = await approveDistributionDraft({
        runId: 'run-1',
        draftId: smsDraft.id,
        userId: 'user-1',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.draft.status).toBe('failed');
      expect(result.draft.dispatchedAt).toBeUndefined();
      expect(result.draft.delivery).toMatchObject({
        state: 'failed',
        attemptedRecipients: 28,
        acceptedRecipients: 26,
        suppressedRecipients: 1,
        error: failure.error,
        retryable: failure.retryable,
        providerMessageIds: smsRecipients
          .slice(2, 27)
          .map(phone => `SM_test_${phone.slice(-4)}`),
      });
      expect(result.draft.delivery?.acceptedAt).toBeUndefined();
      expect(mockSendOutboundSms).not.toHaveBeenCalledWith(
        expect.objectContaining({ to: smsRecipients[0] })
      );
      expect(mockLogDelivery).toHaveBeenCalledTimes(29);
      const finalWrite = updateSet.mock.calls.at(-1)?.[0] as {
        stepOutputs: ReleaseToRevenueRunStepOutputs;
      };
      expect(finalWrite.stepOutputs.distributionDrafts?.items).toContainEqual(
        result.draft
      );
      mockOwnedRun(finalWrite.stepOutputs, { smsRecipients });
      expect(
        await approveDistributionDraft({
          runId: 'run-1',
          draftId: smsDraft.id,
          userId: 'user-1',
        })
      ).toMatchObject({ ok: false, code: 'already-decided' });
      expect(mockSendOutboundSms).toHaveBeenCalledTimes(28);
      expect(mockRecordWorkflowRunOutcome).not.toHaveBeenCalled();
    }
  );
});
