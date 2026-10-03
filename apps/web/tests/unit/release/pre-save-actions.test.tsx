/**
 * PreSaveActions Component Tests
 * Tests the pre-release countdown + notification CTA
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/profile/artist-notifications-cta', () => ({
  ProfileInlineNotificationsCTA: () => (
    <div data-testid='notification-cta'>Notifications CTA</div>
  ),
}));

vi.mock('@/components/features/release/ReleaseCountdown', () => ({
  ReleaseCountdown: ({
    releaseDate,
    compact,
  }: {
    readonly releaseDate: Date;
    readonly compact?: boolean;
  }) => (
    <div
      data-testid='release-countdown-inner'
      data-date={releaseDate.toISOString()}
      data-compact={String(compact)}
    >
      Countdown
    </div>
  ),
}));

import { PreSaveActions } from '@/components/features/release/PreSaveActions';

const defaultArtist = {
  id: 'artist-1',
  owner_user_id: 'user-1',
  handle: 'testartist',
  spotify_id: 'sp-123',
  name: 'Test Artist',
  published: true,
  is_verified: false,
  is_featured: false,
  marketing_opt_out: false,
  created_at: new Date().toISOString(),
};

const defaultProps = {
  releaseDate: new Date(Date.now() + 7 * 86_400_000),
  artistData: defaultArtist,
};

describe('PreSaveActions', () => {
  it('renders countdown timer', () => {
    render(<PreSaveActions {...defaultProps} />);
    const countdown = screen.getByTestId('release-countdown-inner');
    expect(countdown).toHaveAttribute('data-compact', 'true');
  });

  it('passes the release date to the countdown', () => {
    render(<PreSaveActions {...defaultProps} />);
    const countdown = screen.getByTestId('release-countdown-inner');
    expect(countdown).toHaveAttribute(
      'data-date',
      defaultProps.releaseDate.toISOString()
    );
  });

  it('renders notification signup CTA', () => {
    render(<PreSaveActions {...defaultProps} />);
    expect(screen.getByTestId('notification-cta')).toBeInTheDocument();
  });

  it('does not render platform presave buttons', () => {
    render(<PreSaveActions {...defaultProps} />);
    expect(screen.queryByText(/spotify/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/apple music/i)).not.toBeInTheDocument();
  });
});
