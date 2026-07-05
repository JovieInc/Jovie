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
  }),
}));

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
              typeLabel: 'Suggestion',
              createdAt: '2026-06-28T10:00:00.000Z',
              title: 'Detroit listeners up 340% — book a show',
              why: 'Promoter email matched your Detroit growth spike.',
              primaryActionLabel: 'Review pitch',
              status: 'pending',
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
              typeLabel: 'Suggestion',
              createdAt: '2026-06-28T10:00:00.000Z',
              title: 'Detroit listeners up 340% — book a show',
              why: 'Promoter email matched your Detroit growth spike.',
              primaryActionLabel: 'Review pitch',
              status: 'pending',
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
});
