import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OpportunityInboxEmptyState } from './OpportunityInboxEmptyState';

vi.mock('./FounderReviewRecorder', () => ({
  FounderReviewRecorder: () => <div data-testid='founder-recorder' />,
}));

describe('OpportunityInboxEmptyState', () => {
  it('uses the quiet canvas empty state with the catalog action', () => {
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
    // Shell canon: empty states on the canvas carry no card plate.
    expect(emptyState).toHaveAttribute(
      'data-empty-state-presentation',
      'quiet'
    );
    expect(
      emptyState.querySelector('[data-empty-state-card]')
    ).not.toBeInTheDocument();
    expect(screen.getByText('Your Inbox Is Clear')).toBeVisible();
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

  it('keeps the empty creator home free of founder capture', () => {
    render(<OpportunityInboxEmptyState />);
    expect(screen.queryByTestId('founder-recorder')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start A Chat' })).toBeVisible();
  });
});
