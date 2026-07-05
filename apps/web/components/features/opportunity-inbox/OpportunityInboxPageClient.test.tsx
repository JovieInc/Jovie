import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OpportunityInboxPageClient } from './OpportunityInboxPageClient';

const mutateMock = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/app',
}));

vi.mock('@/hooks/useRegisterRightPanel', () => ({
  useRegisterRightPanel: vi.fn(),
}));

vi.mock('@/features/dashboard/organisms/profile-contact-sidebar', () => ({
  ProfileContactSidebar: () => null,
}));

vi.mock('@/lib/queries/useOpportunityInboxMutations', () => ({
  useOpportunityInboxMutations: () => ({
    approveMutation: {
      isPending: false,
      variables: undefined,
      mutate: mutateMock,
    },
    dismissMutation: {
      isPending: false,
      variables: undefined,
      mutate: mutateMock,
    },
    feedbackMutation: {
      isPending: false,
      variables: undefined,
      mutate: mutateMock,
    },
    nextStepMutation: {
      isPending: false,
      variables: undefined,
      mutate: mutateMock,
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
  it('registers a non-null right panel for the artist-profile rail', async () => {
    const { useRegisterRightPanel } = await import(
      '@/hooks/useRegisterRightPanel'
    );
    render(
      <OpportunityInboxPageClient inbox={{ cards: [], emptyActionCards: [] }} />
    );
    expect(vi.mocked(useRegisterRightPanel)).toHaveBeenCalledWith(
      expect.anything()
    );
  });

  it('renders the inbox feed when cards are present', () => {
    render(
      <OpportunityInboxPageClient
        inbox={{
          cards: [
            {
              id: 'card-1',
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
    expect(screen.getByText('Home — the inbox')).toBeInTheDocument();
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
              actionLabel: 'Connect catalog',
              href: '/app/settings/artist-profile',
            },
          ],
        }}
      />
    );

    expect(
      screen.getByTestId('opportunity-inbox-empty-state')
    ).toBeInTheDocument();
    expect(screen.getByText('Connect Spotify')).toBeInTheDocument();
  });

  it('filters cards by signal type and restores them on All', () => {
    render(
      <OpportunityInboxPageClient
        inbox={{
          cards: [
            {
              id: 'song-1',
              signalType: 'new_song' as const,
              typeLabel: 'New Song',
              createdAt: '2026-06-28T10:00:00.000Z',
              title: 'New single detected on Spotify',
              why: 'Fresh release found on your catalog.',
              primaryActionLabel: 'Set up release',
              status: 'pending' as const,
            },
            {
              id: 'event-1',
              signalType: 'new_event' as const,
              typeLabel: 'New Event',
              createdAt: '2026-06-28T10:00:00.000Z',
              title: 'Detroit listeners up 340% — book a show',
              why: 'Promoter email matched your Detroit growth spike.',
              primaryActionLabel: 'Add to calendar',
              status: 'pending' as const,
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

    fireEvent.click(screen.getByRole('button', { name: /Review pitch/ }));
    expect(
      screen.getByTestId('opportunity-inbox-empty-state')
    ).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: /Confirm date/ }));

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

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

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
