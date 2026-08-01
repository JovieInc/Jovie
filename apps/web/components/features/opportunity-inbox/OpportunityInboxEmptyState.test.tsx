import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OpportunityInboxEmptyState } from './OpportunityInboxEmptyState';

describe('OpportunityInboxEmptyState', () => {
  it('uses the canonical centered empty-state layout with the catalog action', () => {
    render(
      <OpportunityInboxEmptyState
        actionCards={[
          {
            id: 'connect-spotify',
            title: 'Connect Spotify',
            body: 'Link your catalog so Jovie can spot releases.',
            actionLabel: 'Connect catalog',
            href: '/app/profiles',
          },
        ]}
      />
    );

    const emptyState = screen.getByTestId('opportunity-inbox-empty-state');
    expect(emptyState).toHaveClass('flex-1', 'items-center', 'justify-center');
    expect(
      screen.getByRole('link', { name: 'Connect catalog' })
    ).toHaveAttribute('href', '/app/profiles');
  });

  it('keeps the chat fallback when no catalog action is available', () => {
    render(<OpportunityInboxEmptyState />);

    expect(screen.getByRole('link', { name: 'Start A Chat' })).toHaveAttribute(
      'href',
      '/app/chat'
    );
  });
});
