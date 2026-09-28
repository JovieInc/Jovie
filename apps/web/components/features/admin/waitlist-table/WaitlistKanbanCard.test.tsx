import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { WaitlistEntryRow } from '@/lib/admin/types';
import { WaitlistKanbanCard } from './WaitlistKanbanCard';

function makeEntry(
  overrides: Partial<WaitlistEntryRow> = {}
): WaitlistEntryRow {
  return {
    id: 'wl_1',
    fullName: 'Ari Lane',
    email: 'ari@example.com',
    primaryGoal: 'streams',
    primarySocialUrl: 'https://instagram.com/ari',
    primarySocialPlatform: 'instagram',
    primarySocialUrlNormalized: 'https://instagram.com/ari',
    spotifyUrl: 'https://open.spotify.com/artist/ari',
    spotifyUrlNormalized: 'https://open.spotify.com/artist/ari',
    spotifyArtistName: 'Ari Lane',
    heardAbout: null,
    status: 'new',
    primarySocialFollowerCount: null,
    createdAt: new Date('2026-01-10T00:00:00.000Z'),
    updatedAt: new Date('2026-01-10T00:00:00.000Z'),
    ...overrides,
  };
}

function renderCard(ui: ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('WaitlistKanbanCard', () => {
  it('renders entry identity, status, and goal', () => {
    renderCard(<WaitlistKanbanCard entry={makeEntry()} />);

    expect(
      screen.getByRole('heading', { name: 'Ari Lane' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'ari@example.com' })
    ).toHaveAttribute('href', 'mailto:ari@example.com');
    expect(screen.getByText('new')).toBeInTheDocument();
    expect(screen.getByText('Streams')).toBeInTheDocument();
    expect(screen.getByTestId('spotify-account-identity')).toHaveTextContent(
      'Ari Lane'
    );
  });

  it('renders the approve action only when a handler is provided', () => {
    const { rerender } = renderCard(<WaitlistKanbanCard entry={makeEntry()} />);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();

    const onApprove = vi.fn();
    rerender(
      <TooltipProvider>
        <WaitlistKanbanCard entry={makeEntry()} onApprove={onApprove} />
      </TooltipProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('disables the action for signed-up entries', () => {
    renderCard(
      <WaitlistKanbanCard
        entry={makeEntry({ status: 'signed_up' })}
        onApprove={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Signed up' })).toBeDisabled();
  });
});
