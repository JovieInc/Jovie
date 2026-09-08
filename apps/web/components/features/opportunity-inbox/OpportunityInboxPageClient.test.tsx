import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpportunityInboxPageClient } from './OpportunityInboxPageClient';

const mutateMock = vi.fn();
const mutateAsyncMock = vi.fn().mockResolvedValue({ ok: true });
let inboxHomeEnabled = false;

vi.mock('next/navigation', () => ({
  usePathname: () => '/app',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('@/lib/flags/client', () => ({
  useAppFlag: () => inboxHomeEnabled,
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

const pendingTourDate = {
  id: 'td-1',
  title: 'Saint Andrews Hall',
  startDate: '2026-08-14T00:00:00.000Z',
  startTime: '7:00 PM',
  venueName: 'Saint Andrews Hall',
  location: 'Detroit, MI',
  providerLabel: 'Bandsintown',
  status: 'pending' as const,
};

describe('OpportunityInboxPageClient', () => {
  afterEach(() => {
    inboxHomeEnabled = false;
    mutateMock.mockReset();
    mutateAsyncMock.mockReset();
    mutateAsyncMock.mockResolvedValue({ ok: true });
    tourDateMutateMock.mockReset();
  });

  it('hydrates the artist-profile rail with the inbox profile data', async () => {
    render(
      <OpportunityInboxPageClient
        inbox={{ cards: [], emptyActionCards: [] }}
        initialLinks={[
          {
            id: 'spotify-link',
            platform: 'spotify',
            platformType: 'dsp',
            url: 'https://open.spotify.com/artist/example',
            sortOrder: 0,
            isActive: true,
            displayText: 'Spotify',
            state: 'active',
            confidence: null,
            sourcePlatform: null,
            sourceType: null,
            evidence: null,
            verificationStatus: null,
            verificationToken: null,
            verifiedAt: null,
            version: 1,
          },
        ]}
      />
    );
    expect(await screen.findByTestId('preview-data-hydrator')).toHaveAttribute(
      'data-initial-link-count',
      '1'
    );
    expect(screen.getByTestId('opportunity-inbox-page').tagName).toBe(
      'SECTION'
    );
    expect(screen.getByTestId('opportunity-inbox-content')).toHaveClass(
      'system-b-opportunity-inbox-page'
    );
  });

  it('renders the inbox feed when cards are present', () => {
    render(
      <OpportunityInboxPageClient
        inbox={{
          cards: [
            {
              id: 'card-1',
              sourceKind: 'test.suggestion',
              signalType: 'other' as const,
              typeLabel: 'Suggestion',
              createdAt: '2026-06-28T10:00:00.000Z',
              title: 'Detroit listeners up 340% — book a show',
              why: 'Promoter email matched your Detroit growth spike.',
              primaryActionLabel: 'Review pitch',
              status: 'pending',
              category: 'suggestion',
            },
          ],
          emptyActionCards: [],
        }}
      />
    );

    expect(screen.getByTestId('opportunity-inbox-feed')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Inbox' })).toBeNull();
    expect(
      screen.queryByText('Pending opportunities, ready to accept or dismiss.')
    ).toBeNull();
  });

  it('renders and filters a verified brand-deal decision', () => {
    render(
      <OpportunityInboxPageClient
        inbox={{
          cards: [
            {
              id: 'brand-deal-1',
              sourceKind: 'test.suggestion',
              signalType: 'brand_deal',
              typeLabel: 'Brand Deal',
              createdAt: '2026-07-29T10:00:00.000Z',
              title: 'Example Brand creator-performance pilot',
              why: '$7.5k-$12.5k · Backstage · verified · score 82.4',
              primaryActionLabel: 'Approve buyer',
              status: 'pending',
              category: 'brand_deal',
            },
            {
              id: 'song-1',
              sourceKind: 'test.suggestion',
              signalType: 'new_song',
              typeLabel: 'New Song',
              createdAt: '2026-07-29T09:00:00.000Z',
              title: 'New single detected',
              why: 'Native Spotify signal.',
              primaryActionLabel: 'Set up release',
              status: 'pending',
              category: 'suggestion',
            },
          ],
          emptyActionCards: [],
        }}
      />
    );

    expect(
      screen.getByText('Example Brand creator-performance pilot')
    ).toBeVisible();
    expect(
      screen.getByText('$7.5k-$12.5k · Backstage · verified · score 82.4')
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Approve buyer' })).toBeVisible();

    fireEvent.click(screen.getByTestId('opportunity-inbox-filter-brand_deal'));
    expect(
      screen.getByText('Example Brand creator-performance pilot')
    ).toBeVisible();
    expect(screen.queryByText('New single detected')).not.toBeInTheDocument();
  });

  it('renders the empty state when there are no cards', () => {
    render(
      <OpportunityInboxPageClient
        inbox={{
          cards: [],
          emptyActionCards: [
            {
              id: 'connect-spotify',
              title: 'Connect Spotify',
              body: 'Link your catalog so Jovie can spot releases.',
              actionLabel: 'Connect Spotify',
              href: '/app/dashboard/releases?connect=spotify',
            },
          ],
        }}
      />
    );

    expect(
      screen.getByTestId('opportunity-inbox-empty-state')
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Inbox' })).toBeNull();
    expect(screen.getByText('Your Inbox Is Clear')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Connect Spotify' })
    ).toHaveAttribute('href', '/app/dashboard/releases?connect=spotify');
  });

  it('filters cards by signal type and restores them on All', () => {
    render(
      <OpportunityInboxPageClient
        inbox={{
          cards: [
            {
              id: 'song-1',
              sourceKind: 'test.suggestion',
              signalType: 'new_song' as const,
              typeLabel: 'New Song',
              createdAt: '2026-06-28T10:00:00.000Z',
              title: 'New single detected on Spotify',
              why: 'Fresh release found on your catalog.',
              primaryActionLabel: 'Set up release',
              status: 'pending' as const,
              category: 'suggestion' as const,
            },
            {
              id: 'event-1',
              sourceKind: 'test.suggestion',
              signalType: 'new_event' as const,
              typeLabel: 'New Event',
              createdAt: '2026-06-28T10:00:00.000Z',
              title: 'Detroit listeners up 340% — book a show',
              why: 'Promoter email matched your Detroit growth spike.',
              primaryActionLabel: 'Add to calendar',
              status: 'pending' as const,
              category: 'suggestion' as const,
            },
          ],
          emptyActionCards: [],
        }}
      />
    );

    expect(
      screen.getByTestId('opportunity-inbox-signal-filters')
    ).toBeInTheDocument();
    expect(screen.getByText('New single detected on Spotify')).toBeVisible();

    fireEvent.click(screen.getByTestId('opportunity-inbox-filter-new_event'));
    expect(
      screen.queryByText('New single detected on Spotify')
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Detroit listeners up 340% — book a show')
    ).toBeVisible();

    fireEvent.click(
      screen.getByTestId('opportunity-inbox-filter-new_profile_match')
    );
    expect(
      screen.getByTestId('opportunity-inbox-filter-empty')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('opportunity-inbox-filter-all'));
    expect(screen.getByText('New single detected on Spotify')).toBeVisible();
  });

  it('keeps filter selection stable while conventional toolbar keys move focus', async () => {
    const user = userEvent.setup();

    render(
      <OpportunityInboxPageClient
        inbox={{
          cards: [
            {
              id: 'song-1',
              sourceKind: 'test.suggestion',
              signalType: 'new_song' as const,
              typeLabel: 'New Song',
              createdAt: '2026-06-28T10:00:00.000Z',
              title: 'New single detected on Spotify',
              why: 'Fresh release found on your catalog.',
              primaryActionLabel: 'Set up release',
              status: 'pending' as const,
              category: 'suggestion' as const,
            },
            {
              id: 'event-1',
              sourceKind: 'test.suggestion',
              signalType: 'new_event' as const,
              typeLabel: 'New Event',
              createdAt: '2026-06-28T10:00:00.000Z',
              title: 'Detroit listeners up 340% — book a show',
              why: 'Promoter email matched your Detroit growth spike.',
              primaryActionLabel: 'Add to calendar',
              status: 'pending' as const,
              category: 'suggestion' as const,
            },
          ],
          emptyActionCards: [],
        }}
      />
    );

    const all = screen.getByRole('button', { name: 'All' });
    const newSong = screen.getByRole('button', { name: 'Songs' });
    const brandDeals = screen.getByRole('button', { name: 'Brand Deals' });

    all.focus();
    await user.keyboard('{ArrowRight}');

    expect(newSong).toHaveFocus();
    expect(all).toHaveAttribute('aria-pressed', 'true');
    expect(newSong).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('New single detected on Spotify')).toBeVisible();

    await user.keyboard(' ');
    expect(newSong).toHaveAttribute('aria-pressed', 'true');
    expect(all).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.queryByText('Detroit listeners up 340% — book a show')
    ).not.toBeInTheDocument();

    await user.keyboard('{End}');
    expect(brandDeals).toHaveFocus();
    expect(newSong).toHaveAttribute('aria-pressed', 'true');

    await user.keyboard('{Home}');
    expect(all).toHaveFocus();
    expect(newSong).toHaveAttribute('aria-pressed', 'true');

    await user.click(brandDeals);
    expect(brandDeals).toHaveAttribute('aria-pressed', 'true');
    expect(brandDeals).toHaveAttribute('tabindex', '0');
    expect(all).toHaveAttribute('tabindex', '-1');
  });

  it.each([
    ['Meta', { metaKey: true }],
    ['Control', { ctrlKey: true }],
    ['Alt', { altKey: true }],
    ['Shift', { shiftKey: true }],
  ])('does not claim %s+ArrowRight from the filter toolbar', (_name, keys) => {
    render(
      <OpportunityInboxPageClient
        inbox={{
          cards: [
            {
              id: 'card-1',
              sourceKind: 'test.suggestion',
              signalType: 'other' as const,
              typeLabel: 'Suggestion',
              createdAt: '2026-06-28T10:00:00.000Z',
              title: 'Detroit listeners up 340% — book a show',
              why: 'Promoter email matched your Detroit growth spike.',
              primaryActionLabel: 'Review pitch',
              status: 'pending' as const,
              category: 'suggestion' as const,
            },
          ],
          emptyActionCards: [],
        }}
      />
    );

    const all = screen.getByRole('button', { name: 'All' });
    const newSong = screen.getByRole('button', { name: 'Songs' });
    all.focus();

    expect(fireEvent.keyDown(all, { key: 'ArrowRight', ...keys })).toBe(true);
    expect(all).toHaveFocus();
    expect(all).toHaveAttribute('aria-pressed', 'true');
    expect(newSong).toHaveAttribute('aria-pressed', 'false');
  });

  it('respects a filter key event already handled by an ancestor', () => {
    render(
      <div onKeyDownCapture={event => event.preventDefault()}>
        <OpportunityInboxPageClient
          inbox={{
            cards: [
              {
                id: 'card-1',
                sourceKind: 'test.suggestion',
                signalType: 'other' as const,
                typeLabel: 'Suggestion',
                createdAt: '2026-06-28T10:00:00.000Z',
                title: 'Detroit listeners up 340% — book a show',
                why: 'Promoter email matched your Detroit growth spike.',
                primaryActionLabel: 'Review pitch',
                status: 'pending' as const,
                category: 'suggestion' as const,
              },
            ],
            emptyActionCards: [],
          }}
        />
      </div>
    );

    const all = screen.getByRole('button', { name: 'All' });
    const newSong = screen.getByRole('button', { name: 'Songs' });
    all.focus();

    expect(fireEvent.keyDown(all, { key: 'ArrowRight' })).toBe(false);
    expect(all).toHaveFocus();
    expect(all).toHaveAttribute('aria-pressed', 'true');
    expect(newSong).toHaveAttribute('aria-pressed', 'false');
  });

  it('removes a card optimistically after approve', () => {
    mutateMock.mockImplementation((_id, options) => {
      options?.onSuccess?.();
    });

    render(
      <OpportunityInboxPageClient
        inbox={{
          cards: [
            {
              id: 'card-1',
              sourceKind: 'test.suggestion',
              signalType: 'other' as const,
              typeLabel: 'Suggestion',
              createdAt: '2026-06-28T10:00:00.000Z',
              title: 'Detroit listeners up 340% — book a show',
              why: 'Promoter email matched your Detroit growth spike.',
              primaryActionLabel: 'Review pitch',
              status: 'pending',
              category: 'suggestion',
            },
          ],
          emptyActionCards: [],
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Plan Opportunity/ }));
    expect(
      screen.getByTestId('opportunity-inbox-empty-state')
    ).toBeInTheDocument();
  });

  it('returns focus to the active filter after clearing its stack', async () => {
    const user = userEvent.setup();
    inboxHomeEnabled = true;

    render(
      <OpportunityInboxPageClient
        inbox={{
          cards: [
            {
              id: 'song-1',
              sourceKind: 'test.suggestion',
              signalType: 'new_song' as const,
              typeLabel: 'New Song',
              createdAt: '2026-06-28T10:00:00.000Z',
              title: 'New single detected',
              why: 'Fresh release found on your catalog.',
              primaryActionLabel: 'Set up release',
              status: 'pending' as const,
              category: 'suggestion' as const,
            },
            {
              id: 'event-1',
              sourceKind: 'test.suggestion',
              signalType: 'new_event' as const,
              typeLabel: 'New Event',
              createdAt: '2026-06-28T10:00:00.000Z',
              title: 'Detroit listeners up 340%',
              why: 'Promoter email matched your Detroit growth spike.',
              primaryActionLabel: 'Add to calendar',
              status: 'pending' as const,
              category: 'suggestion' as const,
            },
          ],
          emptyActionCards: [],
        }}
      />
    );

    const songs = screen.getByRole('button', { name: 'Songs' });
    await user.click(songs);
    screen.getByRole('button', { name: 'Review Current Opportunity' }).focus();

    await user.keyboard('{ArrowRight}');

    expect(screen.getByTestId('opportunity-inbox-filter-empty')).toBeVisible();
    expect(songs).toHaveFocus();
  });

  it('returns focus to the empty-state recovery action after clearing Inbox', async () => {
    const user = userEvent.setup();
    inboxHomeEnabled = true;

    render(
      <OpportunityInboxPageClient
        inbox={{
          cards: [
            {
              id: 'card-1',
              sourceKind: 'test.suggestion',
              signalType: 'other' as const,
              typeLabel: 'Suggestion',
              createdAt: '2026-06-28T10:00:00.000Z',
              title: 'Detroit listeners up 340%',
              why: 'Promoter email matched your Detroit growth spike.',
              primaryActionLabel: 'Review pitch',
              status: 'pending' as const,
              category: 'suggestion' as const,
            },
          ],
          emptyActionCards: [],
        }}
      />
    );

    screen.getByRole('button', { name: 'Review Current Opportunity' }).focus();
    await user.keyboard('{ArrowRight}');

    expect(
      screen.getByTestId('opportunity-inbox-empty-state')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Session' })).toHaveFocus();
  });

  it('returns focus to recovery after completing the last report next step', async () => {
    const user = userEvent.setup();
    inboxHomeEnabled = true;
    mutateMock.mockImplementation((_id, options) => {
      options?.onSuccess?.();
    });

    render(
      <OpportunityInboxPageClient
        inbox={{
          cards: [
            {
              id: 'report-1',
              sourceKind: 'test.suggestion',
              signalType: 'other' as const,
              typeLabel: 'Report',
              createdAt: '2026-07-04T10:00:00.000Z',
              title: 'Thumbnail experiment finished',
              why: 'Jovie measured the results of your experiment.',
              primaryActionLabel: 'Run on 3 more videos',
              status: 'pending' as const,
              category: 'report' as const,
              report: {
                metricLabel: 'views',
                deltaPercent: 5.4,
                deltaDisplay: '+5.4%',
                direction: 'up' as const,
                series: [120, 132],
                items: [],
                experimentId: 'exp-42',
                nextStep: {
                  label: 'Run on 3 more videos',
                  kind: 'experiment.start',
                },
              },
            },
          ],
          emptyActionCards: [],
        }}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Approve' }));

    expect(
      screen.getByTestId('opportunity-inbox-empty-state')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Session' })).toHaveFocus();
  });

  it('does not restore stack focus after a failed report next step', async () => {
    const user = userEvent.setup();
    inboxHomeEnabled = true;
    mutateMock.mockImplementation((_id, options) => {
      options?.onError?.();
    });
    mutateAsyncMock.mockRejectedValueOnce(new Error('next step failed'));

    render(
      <OpportunityInboxPageClient
        inbox={{
          cards: [
            {
              id: 'report-1',
              sourceKind: 'test.suggestion',
              signalType: 'other' as const,
              typeLabel: 'Report',
              createdAt: '2026-07-04T10:00:00.000Z',
              title: 'Thumbnail experiment finished',
              why: 'Jovie measured the results of your experiment.',
              primaryActionLabel: 'Run on 3 more videos',
              status: 'pending' as const,
              category: 'report' as const,
              report: {
                metricLabel: 'views',
                deltaPercent: 5.4,
                deltaDisplay: '+5.4%',
                direction: 'up' as const,
                series: [120, 132],
                items: [],
                experimentId: 'exp-42',
                nextStep: {
                  label: 'Run on 3 more videos',
                  kind: 'experiment.start',
                },
              },
            },
          ],
          emptyActionCards: [],
        }}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Approve' }));
    const songs = screen.getByRole('button', { name: 'Songs' });
    await user.click(songs);

    expect(songs).toHaveFocus();
    expect(screen.getByTestId('opportunity-inbox-filter-empty')).toBeVisible();
  });

  it.each([
    '{ArrowRight}',
    '{ArrowLeft}',
  ])('does not restore stack focus after a failed %s action', async key => {
    const user = userEvent.setup();
    inboxHomeEnabled = true;
    mutateMock.mockImplementation((_id, options) => {
      options?.onError?.();
    });
    mutateAsyncMock.mockRejectedValueOnce(new Error('decision failed'));

    render(
      <OpportunityInboxPageClient
        inbox={{
          cards: [
            {
              id: 'card-1',
              sourceKind: 'test.suggestion',
              signalType: 'other' as const,
              typeLabel: 'Suggestion',
              createdAt: '2026-06-28T10:00:00.000Z',
              title: 'Detroit listeners up 340%',
              why: 'Promoter email matched your Detroit growth spike.',
              primaryActionLabel: 'Review pitch',
              status: 'pending' as const,
              category: 'suggestion' as const,
            },
          ],
          emptyActionCards: [],
        }}
      />
    );

    screen.getByRole('button', { name: 'Review Current Opportunity' }).focus();
    await user.keyboard(key);
    const songs = screen.getByRole('button', { name: 'Songs' });
    await user.click(songs);

    expect(songs).toHaveFocus();
    expect(screen.getByTestId('opportunity-inbox-filter-empty')).toBeVisible();
  });

  it('returns focus to a queue item restored after an asynchronous failure', async () => {
    const user = userEvent.setup();
    inboxHomeEnabled = true;
    let rejectAction: (() => void) | undefined;
    mutateAsyncMock.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectAction = () => reject(new Error('decision failed'));
        })
    );

    render(
      <OpportunityInboxPageClient
        inbox={{
          cards: [
            {
              id: 'card-1',
              sourceKind: 'test.suggestion',
              signalType: 'other' as const,
              typeLabel: 'Suggestion',
              createdAt: '2026-06-28T10:00:00.000Z',
              title: 'Detroit listeners up 340%',
              why: 'Promoter email matched your Detroit growth spike.',
              primaryActionLabel: 'Review pitch',
              status: 'pending' as const,
              category: 'suggestion' as const,
            },
          ],
          emptyActionCards: [],
        }}
      />
    );

    screen.getByRole('button', { name: 'Review Current Opportunity' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: 'Start Session' })).toHaveFocus();

    act(() => {
      rejectAction?.();
    });

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Review Current Opportunity' })
      ).toHaveFocus()
    );
  });

  it('renders pending tour-date cards and confirms optimistically', () => {
    tourDateMutateMock.mockImplementation((_id, options) => {
      options?.onSuccess?.();
    });

    render(
      <OpportunityInboxPageClient
        inbox={{
          cards: [],
          emptyActionCards: [],
          tourDates: {
            pending: [pendingTourDate],
            confirmed: [],
            rejected: [],
          },
        }}
      />
    );

    expect(
      screen.getByTestId('opportunity-inbox-tour-date-review')
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('opportunity-inbox-empty-state')
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Confirm Tour Date/ }));

    expect(
      screen.queryByTestId('opportunity-inbox-tour-date-review')
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId('opportunity-inbox-confirmed-tour-dates')
    ).toBeInTheDocument();
  });

  it('moves a rejected tour date into the hidden rejected section', () => {
    tourDateMutateMock.mockImplementation((_id, options) => {
      options?.onSuccess?.();
    });

    render(
      <OpportunityInboxPageClient
        inbox={{
          cards: [],
          emptyActionCards: [],
          tourDates: {
            pending: [pendingTourDate],
            confirmed: [],
            rejected: [],
          },
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reject Tour Date' }));

    const rejectedSection = screen.getByTestId(
      'opportunity-inbox-rejected-tour-dates'
    );
    expect(rejectedSection).toBeInTheDocument();
    // Hidden by default: the details disclosure starts collapsed.
    expect(rejectedSection).not.toHaveAttribute('open');
    expect(screen.getByText('Rejected Tour Dates (1)')).toBeInTheDocument();
  });

  it('restores a rejected tour date via undo', () => {
    tourDateMutateMock.mockImplementation((_id, options) => {
      options?.onSuccess?.();
    });

    render(
      <OpportunityInboxPageClient
        inbox={{
          cards: [],
          emptyActionCards: [],
          tourDates: {
            pending: [],
            confirmed: [],
            rejected: [{ ...pendingTourDate, status: 'rejected' as const }],
          },
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(
      screen.queryByTestId('opportunity-inbox-rejected-tour-dates')
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId('opportunity-inbox-tour-date-review')
    ).toBeInTheDocument();
  });
});
