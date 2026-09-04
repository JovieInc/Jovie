import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OpportunityInboxEmptyState } from './OpportunityInboxEmptyState';

vi.mock('./FounderReviewRecorder', () => ({
  FounderReviewRecorder: () => <div data-testid='founder-recorder' />,
}));

describe('OpportunityInboxEmptyState', () => {
  it('uses the canonical centered empty-state layout with the catalog action', () => {
    render(
      <OpportunityInboxEmptyState
        actionCards={[
          {
            id: 'connect-spotify',
            title: 'Connect Spotify',
            body: 'Link your catalog so Jovie can spot releases.',
            actionLabel: 'Connect Spotify',
            href: '/app/dashboard/releases?connect=spotify',
          },
        ]}
      />
    );

    const emptyState = screen.getByTestId('opportunity-inbox-empty-state');
    expect(emptyState).toHaveClass('flex-1', 'items-center', 'justify-center');
    expect(screen.getByText('Your Inbox Is Clear')).toHaveClass(
      'text-2xl',
      'font-semibold',
      'tracking-tight'
    );
    expect(
      screen.getByRole('link', { name: 'Connect Spotify' })
    ).toHaveAttribute('href', '/app/dashboard/releases?connect=spotify');
  });

  it('keeps the chat fallback when no catalog action is available', () => {
    render(<OpportunityInboxEmptyState />);

    expect(screen.getByRole('link', { name: 'Start A Chat' })).toHaveAttribute(
      'href',
      '/app/chat'
    );
  });

  it('turns the canonical empty state into a founder brain-dump session', () => {
    render(<OpportunityInboxEmptyState founderMode />);

    expect(screen.getByText('Start A Brain Dump')).toBeVisible();
    expect(screen.getByTestId('founder-recorder')).toBeVisible();
  });
});
