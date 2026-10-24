import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OpportunityInboxEmptyState } from './OpportunityInboxEmptyState';

vi.mock('./FounderReviewRecorder', () => ({
  FounderReviewRecorder: () => <div data-testid='founder-recorder' />,
}));

describe('OpportunityInboxEmptyState', () => {
  it('renders one calm centered line without setup-step actions (JOV-8967)', () => {
    render(<OpportunityInboxEmptyState />);

    const emptyState = screen.getByTestId('opportunity-inbox-empty-state');
    expect(emptyState).toHaveClass('flex-1', 'items-center', 'justify-center');
    expect(emptyState).toHaveAttribute(
      'data-empty-state-presentation',
      'default'
    );
    expect(screen.getByText('Your Inbox Is Clear')).toBeVisible();
  });

  it('never renders a setup-step card or a Connect Spotify CTA (JOV-8967)', () => {
    render(<OpportunityInboxEmptyState />);

    expect(screen.queryByText('Connect Spotify')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Connect Spotify' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Add dates')).not.toBeInTheDocument();
  });

  it('keeps the single chat next step and stays free of founder capture', () => {
    render(<OpportunityInboxEmptyState />);

    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Start A Chat' })).toHaveAttribute(
      'href',
      '/app/chat'
    );
    expect(screen.queryByTestId('founder-recorder')).not.toBeInTheDocument();
  });
});
