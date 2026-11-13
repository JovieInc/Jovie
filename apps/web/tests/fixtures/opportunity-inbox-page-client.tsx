import { vi } from 'vitest';

vi.mock(
  '@/components/features/dashboard/organisms/jovie-work-feed/JovieWorkFeed',
  () => ({
    JovieWorkFeed: ({
      profileId,
      completedOnly,
    }: {
      profileId: string;
      completedOnly: boolean;
    }) => (
      <div
        data-testid='completed-work'
        data-profile={profileId}
        data-completed-only={String(completedOnly)}
      >
        Verified work
      </div>
    ),
  })
);

export const runtimeState = {
  update: null as null | {
    available: boolean;
    busy: boolean;
    title: string;
    description: string;
    apply: () => void;
  },
};
vi.mock('@/components/shell/RuntimeUpdateProvider', () => ({
  useRuntimeUpdate: () => runtimeState.update,
}));
export const mutateMock = vi.fn();
export const refreshMock = vi.fn();
export const mutateAsyncMock = vi.fn().mockResolvedValue({ ok: true });

vi.mock('next/navigation', () => ({
  usePathname: () => '/app',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    refresh: refreshMock,
  }),
}));

vi.mock('@/lib/founder-review/client', () => ({
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
  updateFounderReviewActionOutcome: vi.fn().mockImplementation(async input => ({
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
}));

vi.mock('@/lib/chat/transcriber', () => ({
  createWebSpeechTranscriber: () => ({
    isSupported: false,
    start: vi.fn(),
    stop: vi.fn(),
    dispose: vi.fn(),
  }),
}));

vi.mock('@/features/dashboard/organisms/PreviewDataHydrator', () => ({
  PreviewDataHydrator: ({
    initialLinks,
  }: {
    initialLinks: readonly unknown[];
  }) => (
    <div
      data-testid='preview-data-hydrator'
      data-initial-link-count={initialLinks.length}
    />
  ),
}));

vi.mock('@/lib/queries/useOpportunityInboxMutations', () => ({
  useOpportunityInboxMutations: () => ({
    approveMutation: {
      isPending: false,
      variables: undefined,
      mutate: mutateMock,
      mutateAsync: mutateAsyncMock,
    },
    dismissMutation: {
      isPending: false,
      variables: undefined,
      mutate: mutateMock,
      mutateAsync: mutateAsyncMock,
    },
    feedbackMutation: {
      isPending: false,
      variables: undefined,
      mutate: mutateMock,
      mutateAsync: mutateAsyncMock,
    },
    reviseMutation: {
      isPending: false,
      variables: undefined,
      mutate: mutateMock,
      mutateAsync: mutateAsyncMock,
    },
    nextStepMutation: {
      isPending: false,
      variables: undefined,
      mutate: mutateMock,
      mutateAsync: mutateAsyncMock,
    },
  }),
}));

export const tourDateMutateMock = vi.fn();

vi.mock('@/lib/queries/useTourDateReviewMutations', () => ({
  useTourDateReviewMutations: () => ({
    confirmMutation: {
      isPending: false,
      variables: undefined,
      mutate: tourDateMutateMock,
    },
    rejectMutation: {
      isPending: false,
      variables: undefined,
      mutate: tourDateMutateMock,
    },
    undoRejectMutation: {
      isPending: false,
      variables: undefined,
      mutate: tourDateMutateMock,
    },
  }),
}));
