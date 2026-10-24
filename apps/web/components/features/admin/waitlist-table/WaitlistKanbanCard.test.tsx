import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { WaitlistEntryRow } from '@/lib/admin/types';
import { WaitlistKanbanCard } from './WaitlistKanbanCard';

const entry = {
  id: 'waitlist_1',
  fullName: 'Ari Lane',
  email: 'ari@example.com',
  primaryGoal: null,
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
} as WaitlistEntryRow;

function render(ui: ReactElement) {
  return rtlRender(ui, { wrapper: TooltipProvider });
}

describe('WaitlistKanbanCard', () => {
  it('renders contact and social links with the AA accent text token', () => {
    render(<WaitlistKanbanCard entry={entry} />);
    expect(screen.getByRole('heading', { name: 'Ari Lane' })).toBeVisible();
    expect(
      screen.getByRole('link', { name: /ari@example.com/ })
    ).toHaveAttribute('href', 'mailto:ari@example.com');
    expect(screen.getByRole('link', { name: 'instagram.com/ari' })).toHaveClass(
      'text-(--color-accent-purple-text)'
    );
    // Inline link inside running text: underlined so it is distinguishable
    // without relying on color (axe link-in-text-block).
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveClass(
      'text-(--color-accent-purple-text)',
      'underline'
    );
  });

  it('approves new entries and locks the button while approving', () => {
    const onApprove = vi.fn();
    const { rerender } = render(
      <WaitlistKanbanCard entry={entry} onApprove={onApprove} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onApprove).toHaveBeenCalledOnce();

    rerender(
      <WaitlistKanbanCard
        entry={entry}
        onApprove={onApprove}
        approveStatus='approving'
      />
    );
    expect(screen.getByRole('button', { name: 'Approving…' })).toBeDisabled();
  });

  it('offers Disapprove for approved entries', () => {
    render(
      <WaitlistKanbanCard
        entry={{ ...entry, status: 'approved' } as WaitlistEntryRow}
        onApprove={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Disapprove' })).toBeEnabled();
  });
});
