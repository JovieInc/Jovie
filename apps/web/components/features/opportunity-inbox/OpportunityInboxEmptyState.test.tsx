import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OpportunityInboxEmptyState } from './OpportunityInboxEmptyState';

vi.mock('./FounderReviewRecorder', () => ({
  FounderReviewRecorder: () => <div data-testid='founder-recorder' />,
}));

describe('OpportunityInboxEmptyState', () => {
  it('preserves the existing cleared-queue state without setup data', () => {
    render(<OpportunityInboxEmptyState />);

    const emptyState = screen.getByTestId('opportunity-inbox-empty-state');
    expect(emptyState).toHaveClass('flex-1', 'items-center', 'justify-center');
    expect(emptyState).toHaveAttribute(
      'data-empty-state-presentation',
      'default'
    );
    expect(screen.getByText('Your Inbox Is Clear')).toBeVisible();
    // One line means one line: the old supporting sentence and any second
    // block stay gone.
    expect(
      screen.queryByText('Jovie is watching for the next opportunity.')
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(1);
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

describe('first-run Home', () => {
  it.each([0, 1, 2])('counts only the %i verified setup facts', completed => {
    render(
      <OpportunityInboxEmptyState
        setup={{
          profileComplete: completed >= 1,
          musicConnected: completed >= 2,
          linksAdded: completed >= 3,
        }}
      />
    );
    expect(
      screen.getByRole('progressbar', { name: 'Setup Completion' })
    ).toHaveAttribute('aria-valuenow', String(completed));
    expect(screen.getByText(`${completed} of 3 complete`)).toBeVisible();
    expect(screen.queryAllByRole('link', { name: /— Complete/ })).toHaveLength(
      completed
    );
  });

  it('stops presenting finished setup as a task but keeps every step reachable', async () => {
    render(
      <OpportunityInboxEmptyState
        setup={{
          profileComplete: true,
          musicConnected: true,
          linksAdded: true,
        }}
      />
    );

    // JOV-12615: no dominant checklist, progress bar or "3 of 3 complete".
    expect(screen.getByTestId('opportunity-inbox-empty-state')).toHaveAttribute(
      'data-home-setup-state',
      'complete'
    );
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText('3 of 3 complete')).not.toBeInTheDocument();
    expect(screen.queryByText('Make Jovie Yours')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Plan Your Next Release' })
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Start A Chat' })).toHaveAttribute(
      'href',
      '/app/chat'
    );

    // Settings stay one click away through the Setup Complete popover.
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Setup Complete' }));
    const stepLinks = await screen.findAllByRole('link', {
      name: /— Complete/,
    });
    expect(stepLinks.map(link => link.getAttribute('href'))).toEqual([
      '/app/settings/profile',
      '/app/settings/profile',
      '/app/settings/profile',
    ]);
    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('link', { name: /— Complete/ })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Setup Complete' })
    ).toHaveFocus();
  });

  it('offers real setup destinations and a chat without auto-submitting a prompt', async () => {
    render(
      <OpportunityInboxEmptyState
        setup={{
          profileComplete: false,
          musicConnected: false,
          linksAdded: false,
        }}
      />
    );
    const links = screen.getAllByRole('link');
    expect(links.slice(0, 3).map(link => link.getAttribute('href'))).toEqual([
      '/app/settings/profile',
      '/app/settings/profile',
      '/app/settings/profile',
    ]);
    expect(screen.getByRole('link', { name: 'Start A Chat' })).toHaveAttribute(
      'href',
      '/app/chat'
    );
    expect(
      screen.getByRole('link', { name: 'View Completed Work' })
    ).toHaveAttribute('href', '/app?view=done');
    const user = userEvent.setup();
    for (const link of links) {
      await user.tab();
      expect(link).toHaveFocus();
    }
    expect(screen.queryByText('Your Inbox Is Clear')).not.toBeInTheDocument();
  });
});
