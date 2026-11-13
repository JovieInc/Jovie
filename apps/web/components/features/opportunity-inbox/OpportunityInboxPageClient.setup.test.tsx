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

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  DashboardDataContext,
  type DashboardDataContextValue,
} from '@/app/app/(shell)/dashboard/DashboardDataContext';
import type { OpportunityInboxData } from '@/lib/connectors/opportunity-inbox-types';
import { OpportunityInboxPageClient } from './OpportunityInboxPageClient';

const runtimeState = vi.hoisted(() => ({
  update: null as null | {
    available: boolean;
    busy: boolean;
    title: string;
    description: string;
    apply: () => void;
  },
}));
vi.mock('@/components/shell/RuntimeUpdateProvider', () => ({
  useRuntimeUpdate: () => runtimeState.update,
}));
const mutateMock = vi.fn();
const refreshMock = vi.fn();
const mutateAsyncMock = vi.fn().mockResolvedValue({ ok: true });

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

const tourDateMutateMock = vi.fn();

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

const HEALTHY_AVAILABILITY = {
  suggestedActions: 'available',
  tourDates: 'not_requested',
} as const;

// Only the fields consumed by Home are needed in this context fixture.
const firstRunData = {
  selectedProfile: { id: 'setup-profile' },
  profileCompletion: { percentage: 50 },
  hasMusicLinks: false,
  hasSocialLinks: false,
} as DashboardDataContextValue;
const emptyHomeInbox: OpportunityInboxData = {
  cards: [],
  emptyActionCards: [],
  availability: HEALTHY_AVAILABILITY,
};

function FirstRunHome({
  data = firstRunData,
  inbox = emptyHomeInbox,
  initialView = 'needs',
  initialLinks = [],
  profileId = 'setup-profile',
}: {
  profileId?: string | null;
  initialLinks?: import('@/app/app/(shell)/dashboard/actions/social-links').ProfileSocialLink[];
  data?: DashboardDataContextValue;
  inbox?: OpportunityInboxData;
  initialView?: 'needs' | 'done';
}) {
  return (
    <DashboardDataContext.Provider value={data}>
      <OpportunityInboxPageClient
        inbox={inbox}
        profileId={profileId}
        initialView={initialView}
        initialLinks={initialLinks}
      />
    </DashboardDataContext.Provider>
  );
}

describe('data-backed Home setup', () => {
  it('keeps chat available without linking to a profile editor when no profile exists', () => {
    render(
      <FirstRunHome
        data={{ ...firstRunData, selectedProfile: null }}
        profileId={null}
      />
    );
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start A Chat' })).toBeVisible();
  });

  it.each([
    ['active', true, '1'],
    ['suggested', true, '0'],
    ['rejected', true, '0'],
    ['active', false, '0'],
  ] as const)(
    'counts only active accepted links (%s, active=%s)',
    (state, isActive, expected) => {
      render(
        <FirstRunHome
          initialLinks={[
            {
              id: 'link',
              platform: 'instagram',
              url: 'https://instagram.com/artist',
              sortOrder: 0,
              state,
              isActive,
            },
          ]}
        />
      );
      expect(screen.getByRole('progressbar')).toHaveAttribute(
        'aria-valuenow',
        expected
      );
    }
  );

  it('moves focus to setup when returning from completed work', async () => {
    render(<FirstRunHome initialView='done' />);
    await userEvent.click(screen.getByRole('button', { name: 'Needs You' }));
    expect(
      screen.getByRole('link', { name: /Complete Your Profile/ })
    ).toHaveFocus();
  });

  it('replaces empty chrome and derives progress from the existing profile completion contract', () => {
    render(
      <FirstRunHome
        data={{
          ...firstRunData,
          profileCompletion: {
            ...firstRunData.profileCompletion,
            percentage: 100,
          },
          hasMusicLinks: true,
        }}
      />
    );
    expect(
      screen.getByRole('heading', { name: 'Make Jovie Yours' })
    ).toBeVisible();
    expect(screen.getByText('2 of 3 complete')).toBeVisible();
    expect(
      screen.queryByRole('toolbar', { name: 'Inbox View' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add Notes' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'View Completed Work' })
    ).toBeVisible();
  });

  it('does not hide the completed-work deep link view', () => {
    render(<FirstRunHome initialView='done' />);
    expect(screen.getByTestId('completed-work')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Needs You' })).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Make Jovie Yours' })
    ).not.toBeInTheDocument();
  });

  it.each([
    {
      ...firstRunData,
      dashboardLoadError: {
        stage: 'core_fetch',
        message: 'Read failed',
        code: null,
      },
    },
    { ...firstRunData, selectedProfile: { id: 'another-profile' } },
  ])(
    'does not infer setup from unavailable or mismatched profile data',
    data => {
      render(<FirstRunHome data={data as DashboardDataContextValue} />);
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    }
  );

  it('keeps read errors distinct from setup and restores keyboard focus when retry succeeds', async () => {
    const { rerender } = render(
      <FirstRunHome
        inbox={{
          ...emptyHomeInbox,
          availability: {
            suggestedActions: 'unknown',
            tourDates: 'not_requested',
          },
        }}
      />
    );
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    rerender(<FirstRunHome />);
    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: /Complete Your Profile/ })
      ).toHaveFocus()
    );
  });

  it('preserves a populated queue and its cleared state after review', async () => {
    mutateMock.mockImplementation((_id, callbacks) => callbacks?.onSuccess?.());
    const card = {
      id: 'setup-card',
      signalType: 'other',
      typeLabel: 'Suggestion',
      createdAt: '2026-01-15T12:00:00Z',
      title: 'Review Your Release',
      why: 'Review this release.',
      primaryActionLabel: 'Review',
      status: 'pending',
      category: 'suggestion',
    } as const;
    render(<FirstRunHome inbox={{ ...emptyHomeInbox, cards: [card] }} />);
    expect(screen.getByRole('button', { name: 'Needs You' })).toBeVisible();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    const review = screen.getByRole('button', {
      name: 'Review Current Opportunity',
    });
    review.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByText('Your Inbox Is Clear')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Start A Chat' })).toHaveFocus();
  });
});
