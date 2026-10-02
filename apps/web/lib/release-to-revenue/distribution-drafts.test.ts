import { lintCopy } from '@jovie/copy';
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
  DISTRIBUTION_DRAFT_EXPECTED_COUNTS,
  rejectDistributionDraft,
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

describe('buildDistributionDrafts', () => {
  it('creates 3 social posts on one platform and 1 SMS draft', () => {
    const drafts = buildDistributionDrafts({
      releaseTitle: 'Neon Sky',
      releaseLink: 'https://jov.ie/timwhite/neon-sky',
      merchDropLink: 'https://jov.ie/timwhite/merch/card-1',
      platform: 'instagram',
      createdAt: '2026-06-20T08:00:00.000Z',
    });

    expect(drafts.items).toHaveLength(DISTRIBUTION_DRAFT_EXPECTED_COUNTS.total);

    const socialPosts = drafts.items.filter(
      item => item.channel === 'social_post'
    );
    const smsDrafts = drafts.items.filter(item => item.channel === 'sms');

    expect(socialPosts).toHaveLength(
      DISTRIBUTION_DRAFT_EXPECTED_COUNTS.socialPosts
    );
    expect(smsDrafts).toHaveLength(DISTRIBUTION_DRAFT_EXPECTED_COUNTS.sms);
    expect(socialPosts.every(post => post.platform === 'instagram')).toBe(true);
    expect(smsDrafts[0]?.body).toContain('Neon Sky');
    expect(smsDrafts[0]?.body).toContain('https://jov.ie/timwhite/neon-sky');
    expect(smsDrafts[0]?.body).toContain(
      'https://jov.ie/timwhite/merch/card-1'
    );
    expect(drafts.items.every(item => item.status === 'pending')).toBe(true);
  });

  it('keeps every drafted post inside the customer-voice copy floor', () => {
    const drafts = buildDistributionDrafts({
      releaseTitle: 'Neon Sky',
      releaseLink: 'https://jov.ie/timwhite/neon-sky',
      merchDropLink: 'https://jov.ie/timwhite/merch/card-1',
      platform: 'instagram',
      createdAt: '2026-06-20T08:00:00.000Z',
    });

    // Drafts ship in the customer's voice; canon/VOICE.md requires the
    // deterministic floor to pass before send (JOV-6616).
    for (const item of drafts.items) {
      const { blocking } = lintCopy(item.body, {
        register: 'customer-voice',
      });
      expect(blocking, `${item.variant}: ${item.body}`).toEqual([]);
    }
  });
});

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

  it('marks an approved social draft undeliverable when no provider exists', async () => {
    const drafts = buildDistributionDrafts({
      releaseTitle: 'Neon Sky',
      releaseLink: 'https://jov.ie/timwhite/neon-sky',
      merchDropLink: 'https://jov.ie/timwhite/merch',
      platform: 'instagram',
    });
    const draftToApprove = drafts.items[0];
    const updateSet = mockPersistedRun({
      ...baseStepOutputs,
      distributionDrafts: drafts,
    });

    const result = await approveDistributionDraft({
      runId: 'run-1',
      draftId: draftToApprove.id,
      userId: 'user-1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    // No social provider adapter exists — approval must never surface as
    // dispatched. The draft is honestly undeliverable with a recorded reason.
    expect(result.draft.status).toBe('undeliverable');
    expect(result.draft.delivery?.state).toBe('unsupported-channel');
    expect(result.draft.dispatchedAt).toBeUndefined();
    expect(result.draft.payloadDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(result.draft.idempotencyKey).toBe(`run-1:${draftToApprove.id}`);
    expect(result.runStatus).toBe('waiting_for_approval');
    expect(mockSendOutboundSms).not.toHaveBeenCalled();

    // Approved intent is persisted before the delivery attempt settles.
    const approvedWrite = updateSet.mock.calls[0]?.[0] as {
      stepOutputs: ReleaseToRevenueRunStepOutputs;
    };
    const approvedDraft =
      approvedWrite.stepOutputs.distributionDrafts?.items.find(
        item => item.id === draftToApprove.id
      );
    expect(approvedDraft?.status).toBe('approved');

    const finalWrite = updateSet.mock.calls.at(-1)?.[0] as {
      stepOutputs: ReleaseToRevenueRunStepOutputs;
    };
    const untouched = finalWrite.stepOutputs.distributionDrafts?.items.find(
      item => item.id !== draftToApprove.id
    );
    expect(untouched?.status).toBe('pending');
  });

  it('dispatches an approved SMS draft to consented recipients via the provider', async () => {
    const drafts = buildDistributionDrafts({
      releaseTitle: 'Neon Sky',
      releaseLink: 'https://jov.ie/timwhite/neon-sky',
      merchDropLink: 'https://jov.ie/timwhite/merch',
      platform: 'instagram',
    });
    const smsDraft = drafts.items.find(item => item.channel === 'sms');
    mockPersistedRun(
      { ...baseStepOutputs, distributionDrafts: drafts },
      { smsRecipients: ['+15551234567', '+15557654321'] }
    );

    const result = await approveDistributionDraft({
      runId: 'run-1',
      draftId: smsDraft?.id ?? '',
      userId: 'user-1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(mockSendOutboundSms).toHaveBeenCalledTimes(2);
    expect(mockSendOutboundSms).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '+15551234567',
        body: smsDraft?.body,
      })
    );
    expect(result.draft.status).toBe('dispatched');
    expect(result.draft.dispatchedAt).toBeTruthy();
    expect(result.draft.delivery?.state).toBe('accepted');
    expect(result.draft.delivery?.provider).toBe('twilio');
    expect(result.draft.delivery?.providerMessageIds).toContain('SM_test_1');
    expect(result.draft.delivery?.acceptedRecipients).toBe(2);
  });

  it('marks an approved SMS draft undeliverable when the provider is not configured', async () => {
    mockIsOutboundSmsEnabled.mockReturnValue(false);
    const drafts = buildDistributionDrafts({
      releaseTitle: 'Neon Sky',
      releaseLink: 'https://jov.ie/timwhite/neon-sky',
      merchDropLink: null,
      platform: 'instagram',
    });
    const smsDraft = drafts.items.find(item => item.channel === 'sms');
    mockPersistedRun({ ...baseStepOutputs, distributionDrafts: drafts });

    const result = await approveDistributionDraft({
      runId: 'run-1',
      draftId: smsDraft?.id ?? '',
      userId: 'user-1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(mockSendOutboundSms).not.toHaveBeenCalled();
    expect(result.draft.status).toBe('undeliverable');
    expect(result.draft.delivery?.state).toBe('provider-not-configured');
    expect(result.draft.dispatchedAt).toBeUndefined();
  });

  it('marks an approved SMS draft undeliverable with no consented recipients', async () => {
    const drafts = buildDistributionDrafts({
      releaseTitle: 'Neon Sky',
      releaseLink: 'https://jov.ie/timwhite/neon-sky',
      merchDropLink: null,
      platform: 'instagram',
    });
    const smsDraft = drafts.items.find(item => item.channel === 'sms');
    mockPersistedRun(
      { ...baseStepOutputs, distributionDrafts: drafts },
      { smsRecipients: [] }
    );

    const result = await approveDistributionDraft({
      runId: 'run-1',
      draftId: smsDraft?.id ?? '',
      userId: 'user-1',
    });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) {
      return;
    }
    expect(mockSendOutboundSms).not.toHaveBeenCalled();
    expect(result.draft.status).toBe('undeliverable');
    expect(result.draft.delivery?.state).toBe('no-consented-recipients');
  });

  it('marks an approved SMS draft failed when the provider rejects the send', async () => {
    mockSendOutboundSms.mockResolvedValue({
      success: false,
      error: 'Twilio request failed with HTTP 400',
      errorCode: '21211',
      httpStatus: 400,
      retryable: false,
    });
    const drafts = buildDistributionDrafts({
      releaseTitle: 'Neon Sky',
      releaseLink: 'https://jov.ie/timwhite/neon-sky',
      merchDropLink: null,
      platform: 'instagram',
    });
    const smsDraft = drafts.items.find(item => item.channel === 'sms');
    mockPersistedRun(
      { ...baseStepOutputs, distributionDrafts: drafts },
      { smsRecipients: ['+15551234567'] }
    );

    const result = await approveDistributionDraft({
      runId: 'run-1',
      draftId: smsDraft?.id ?? '',
      userId: 'user-1',
    });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) {
      return;
    }
    expect(result.draft.status).toBe('failed');
    expect(result.draft.delivery?.state).toBe('failed');
    expect(result.draft.delivery?.error).toContain('Twilio');
    expect(result.draft.dispatchedAt).toBeUndefined();

    // A failed draft is terminal: replay cannot double-send a provider that
    // may have accepted an ambiguous attempt. Re-load the persisted failed
    // state for the second decision.
    const failedDraft = result.draft;
    mockOwnedRun({
      ...baseStepOutputs,
      distributionDrafts: {
        ...drafts,
        items: drafts.items.map(item =>
          item.id === smsDraft?.id ? failedDraft : item
        ),
      },
    });
    const second = await approveDistributionDraft({
      runId: 'run-1',
      draftId: smsDraft?.id ?? '',
      userId: 'user-1',
    });
    expect(second).toMatchObject({ ok: false, code: 'already-decided' });
    expect(mockSendOutboundSms).toHaveBeenCalledTimes(1);
  });

  it('is idempotent for a duplicate approval of a dispatched draft', async () => {
    const drafts = buildDistributionDrafts({
      releaseTitle: 'Neon Sky',
      releaseLink: 'https://jov.ie/timwhite/neon-sky',
      merchDropLink: null,
      platform: 'instagram',
    });
    const smsDraft = drafts.items.find(item => item.channel === 'sms');
    const dispatchedDraft = {
      ...smsDraft!,
      status: 'dispatched' as const,
      decidedAt: '2026-06-20T09:00:00.000Z',
      dispatchedAt: '2026-06-20T09:00:01.000Z',
      payloadDigest: 'abc',
      idempotencyKey: `run-1:${smsDraft?.id}`,
      delivery: {
        provider: 'twilio' as const,
        state: 'accepted' as const,
        attemptedAt: '2026-06-20T09:00:00.000Z',
        acceptedAt: '2026-06-20T09:00:01.000Z',
        attemptedRecipients: 1,
        acceptedRecipients: 1,
        suppressedRecipients: 0,
        providerMessageIds: ['SM_prev'],
      },
    };
    mockPersistedRun({
      ...baseStepOutputs,
      distributionDrafts: {
        ...drafts,
        items: drafts.items.map(item =>
          item.id === smsDraft?.id ? dispatchedDraft : item
        ),
      },
    });

    const result = await approveDistributionDraft({
      runId: 'run-1',
      draftId: smsDraft?.id ?? '',
      userId: 'user-1',
    });

    expect(result.ok).toBe(true);
    expect(mockSendOutboundSms).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('discards a pending draft without dispatching it', async () => {
    const drafts = buildDistributionDrafts({
      releaseTitle: 'Neon Sky',
      releaseLink: 'https://jov.ie/timwhite/neon-sky',
      merchDropLink: null,
      platform: 'instagram',
    });
    const draftToReject = drafts.items[1];
    mockPersistedRun({
      ...baseStepOutputs,
      distributionDrafts: drafts,
    });

    const result = await rejectDistributionDraft({
      runId: 'run-1',
      draftId: draftToReject.id,
      userId: 'user-1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.draft.status).toBe('rejected');
    expect(result.draft.dispatchedAt).toBeUndefined();
    expect(mockSendOutboundSms).not.toHaveBeenCalled();
  });

  it('completes an all-rejected run without recording an activated outcome', async () => {
    const drafts = buildDistributionDrafts({
      releaseTitle: 'Neon Sky',
      releaseLink: 'https://jov.ie/timwhite/neon-sky',
      merchDropLink: null,
      platform: 'instagram',
    });
    const lastDraft = drafts.items.at(-1);
    const updateSet = mockPersistedRun({
      ...baseStepOutputs,
      distributionDrafts: {
        ...drafts,
        items: drafts.items.map(draft => ({
          ...draft,
          status: draft.id === lastDraft?.id ? 'pending' : 'rejected',
        })),
      },
    });

    const result = await rejectDistributionDraft({
      runId: 'run-1',
      draftId: lastDraft?.id ?? '',
      userId: 'user-1',
    });

    expect(result).toMatchObject({ ok: true, runStatus: 'completed' });
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', currentStep: 'completed' })
    );
    expect(mockRecordWorkflowRunOutcome).not.toHaveBeenCalled();
  });

  it('records an outcome when completion includes a provider-verified dispatched draft', async () => {
    const drafts = buildDistributionDrafts({
      releaseTitle: 'Neon Sky',
      releaseLink: 'https://jov.ie/timwhite/neon-sky',
      merchDropLink: null,
      platform: 'instagram',
    });
    const lastDraft = drafts.items.at(-1);
    mockPersistedRun(
      {
        ...baseStepOutputs,
        distributionDrafts: {
          ...drafts,
          items: drafts.items.map(draft => ({
            ...draft,
            status: draft.id === lastDraft?.id ? 'pending' : 'rejected',
          })),
        },
      },
      { smsRecipients: ['+15551234567'] }
    );

    const result = await approveDistributionDraft({
      runId: 'run-1',
      draftId: lastDraft?.id ?? '',
      userId: 'user-1',
    });

    expect(result).toMatchObject({ ok: true, runStatus: 'completed' });
    if (result.ok) {
      expect(result.draft.status).toBe('dispatched');
      expect(result.draft.delivery?.state).toBe('accepted');
    }
    expect(mockRecordWorkflowRunOutcome).toHaveBeenCalledWith('run-1');
  });

  it('does not record an outcome when completion has no verified dispatch', async () => {
    const drafts = buildDistributionDrafts({
      releaseTitle: 'Neon Sky',
      releaseLink: 'https://jov.ie/timwhite/neon-sky',
      merchDropLink: null,
      platform: 'instagram',
    });
    const lastDraft = drafts.items.at(-1);
    mockPersistedRun({
      ...baseStepOutputs,
      distributionDrafts: {
        ...drafts,
        items: drafts.items.map(draft => ({
          ...draft,
          status: draft.id === lastDraft?.id ? 'pending' : 'rejected',
        })),
      },
    });

    // lastDraft is the SMS draft; provider is configured but there are no
    // consented recipients, so it settles undeliverable — the run completes
    // but nothing counts as delivered.
    const result = await approveDistributionDraft({
      runId: 'run-1',
      draftId: lastDraft?.id ?? '',
      userId: 'user-1',
    });

    expect(result).toMatchObject({ ok: true, runStatus: 'completed' });
    if (result.ok) {
      expect(result.draft.status).toBe('undeliverable');
    }
    expect(mockRecordWorkflowRunOutcome).not.toHaveBeenCalled();
  });
});
