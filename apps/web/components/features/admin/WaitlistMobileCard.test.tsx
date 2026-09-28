import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { WaitlistEntryRow } from '@/lib/admin/types';
import { WaitlistMobileCard } from './WaitlistMobileCard';

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
    heardAbout: 'A friend',
    status: 'new',
    primarySocialFollowerCount: 12800,
    createdAt: new Date('2026-01-10T00:00:00.000Z'),
    updatedAt: new Date('2026-01-10T00:00:00.000Z'),
    ...overrides,
  };
}

function renderCard(ui: ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('WaitlistMobileCard', () => {
  it('renders identity, status, and platform badges', () => {
    renderCard(
      <WaitlistMobileCard
        entry={makeEntry()}
        approveStatus='idle'
        onApprove={vi.fn()}
      />
    );

    expect(screen.getByText('Ari Lane')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'ari@example.com' })
    ).toHaveAttribute('href', 'mailto:ari@example.com');
    expect(screen.getByText('Waitlisted')).toBeInTheDocument();
    expect(screen.getByText('Instagram')).toBeInTheDocument();
    expect(screen.getByText('Streams')).toBeInTheDocument();
  });

  it('reveals expanded details on demand', () => {
    renderCard(
      <WaitlistMobileCard
        entry={makeEntry()}
        approveStatus='idle'
        onApprove={vi.fn()}
      />
    );

    expect(screen.queryByText('Followers')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show more details' }));
    expect(screen.getByText('12,800')).toBeInTheDocument();
    expect(screen.getByTestId('spotify-account-identity')).toHaveTextContent(
      'Ari Lane'
    );
    expect(screen.getByText('A friend')).toBeInTheDocument();
  });

  it('invokes onApprove for actionable entries', () => {
    const onApprove = vi.fn();
    renderCard(
      <WaitlistMobileCard
        entry={makeEntry()}
        approveStatus='idle'
        onApprove={onApprove}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('disables the action for signed-up and in-flight entries', () => {
    renderCard(
      <WaitlistMobileCard
        entry={makeEntry({ status: 'signed_up' })}
        approveStatus='idle'
        onApprove={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Signed up' })).toBeDisabled();
  });
});
