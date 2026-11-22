import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProfileDesktopSideRailRows } from './ProfileDesktopSideRailRows';

const base = {
  artistName: 'Tim White',
  showUpdates: true,
  isSubscribed: false,
  showArtistEmailRow: false,
  hasTip: true,
  onGetUpdates: vi.fn(),
  onOpenPayments: vi.fn(),
};

describe('ProfileDesktopSideRailRows', () => {
  it('says Get updates once and calls back', async () => {
    const onGetUpdates = vi.fn();
    render(
      <ProfileDesktopSideRailRows {...base} onGetUpdates={onGetUpdates} />
    );

    expect(screen.getAllByText('Get updates')).toHaveLength(1);
    await userEvent.click(screen.getByTestId('profile-desktop-get-updates'));
    expect(onGetUpdates).toHaveBeenCalledTimes(1);
  });

  it('passes the Pay row as the popover anchor', async () => {
    const onOpenPayments = vi.fn();
    render(
      <ProfileDesktopSideRailRows {...base} onOpenPayments={onOpenPayments} />
    );

    const pay = screen.getByTestId('profile-desktop-open-payments');
    await userEvent.click(pay);
    expect(onOpenPayments).toHaveBeenCalledWith(pay);
  });

  it('omits Pay without a pay destination and hides Get updates when asked', () => {
    render(
      <ProfileDesktopSideRailRows
        {...base}
        hasTip={false}
        showUpdates={false}
      />
    );

    expect(
      screen.queryByTestId('profile-desktop-open-payments')
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('profile-desktop-alerts-card')).toHaveClass(
      'hidden'
    );
  });
});
