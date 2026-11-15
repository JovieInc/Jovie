import { vi } from 'vitest';

/**
 * Module stand-ins for OpportunityInboxPageClient tests: the founder-review
 * client (receipts round-trip with a pending outcome for approve/reject) and
 * the inbox mutation hook, whose five mutations share one mutate pair.
 * Load them from a `vi.mock` factory with a dynamic import.
 */
export function founderReviewClientMock() {
  return {
    listFounderReviewReceipts: vi.fn().mockResolvedValue([]),
    deleteFounderReviewAudio: vi.fn(),
    uploadFounderReviewAudio: vi.fn(),
    createFounderReviewClient: vi.fn().mockImplementation(async review => ({
      id: review.segmentId,
      target: review.target,
      decision: review.decision,
      recording: { mediaAvailable: false },
      actionOutcome: {
        status:
          review.decision === 'approved' || review.decision === 'rejected'
            ? 'pending'
            : 'not-applicable',
        updatedAt: '2026-09-01T18:00:08.000Z',
        errorCode: null,
      },
    })),
    updateFounderReviewActionOutcome: vi
      .fn()
      .mockImplementation(async input => ({
        id: input.receiptId,
        target: {
          type: 'inbox-card',
          id: 'card-1',
          title: 'Saved founder review',
          sourceKind: 'test.suggestion',
          category: 'suggestion',
        },
        decision: 'approved',
        recording: { mediaAvailable: false },
        actionOutcome: {
          status: input.status,
          updatedAt: '2026-09-01T18:00:08.000Z',
          errorCode: input.errorCode,
        },
      })),
  };
}

const INBOX_MUTATION_KEYS = [
  'approveMutation',
  'dismissMutation',
  'feedbackMutation',
  'reviseMutation',
  'nextStepMutation',
] as const;

interface InboxMutateMocks {
  readonly mutate: (...args: unknown[]) => unknown;
  readonly mutateAsync: (...args: unknown[]) => unknown;
}

/**
 * `getMocks` is read on each hook call, not when the factory runs, so the
 * test file's own mock functions can be declared after the hoisted mock.
 */
export function inboxMutationsMock(getMocks: () => InboxMutateMocks) {
  return {
    useOpportunityInboxMutations: () => {
      const { mutate, mutateAsync } = getMocks();
      return Object.fromEntries(
        INBOX_MUTATION_KEYS.map(key => [
          key,
          { isPending: false, variables: undefined, mutate, mutateAsync },
        ])
      );
    },
  };
}
