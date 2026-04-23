import { fireEvent, render, screen } from '@testing-library/react';
import { cloneElement, isValidElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

type LinkProps = {
  readonly href: string;
  readonly children: React.ReactNode;
  readonly [key: string]: unknown;
};

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: LinkProps) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('@/features/release/ReleaseNotificationsProvider', () => ({
  ReleaseNotificationsProvider: ({
    children,
  }: {
    readonly children: React.ReactNode;
  }) => <div data-testid='notifications-provider'>{children}</div>,
}));

vi.mock('@/features/profile/artist-notifications-cta', () => ({
  ProfileInlineNotificationsCTA: () => (
    <div data-testid='profile-inline-cta'>Turn on notifications</div>
  ),
}));

const shareSpy = vi.fn();

vi.mock('@/features/share/PublicShareMenu', () => ({
  PublicShareMenu: ({ trigger }: { readonly trigger: React.ReactNode }) =>
    isValidElement(trigger)
      ? cloneElement(trigger, {
          onClick: () => shareSpy(),
        })
      : null,
}));

vi.mock('@/features/release/ReleaseCountdown', () => ({
  ReleaseCountdown: () => <div data-testid='release-countdown'>Countdown</div>,
}));

vi.mock('@/features/release/SmartLinkPagePrimitives', () => ({
  SmartLinkArtworkCard: ({ title }: { readonly title: string }) => (
    <div data-testid='artwork-card'>{title}</div>
  ),
  SmartLinkPageFrame: ({
    children,
  }: {
    readonly children: React.ReactNode;
  }) => <div data-testid='page-frame'>{children}</div>,
}));

// Must import AFTER all vi.mock calls
import { ScheduledReleasePage } from '@/features/release/ScheduledReleasePage';

const defaultProps = {
  release: {
    title: 'Midnight Drive',
    artworkUrl: 'https://example.com/art.jpg',
    releaseDate: new Date(Date.now() + 86_400_000).toISOString(),
  },
  artist: {
    id: 'artist-123',
    name: 'Tim White',
    handle: 'timwhite',
    avatarUrl: 'https://example.com/avatar.jpg',
  },
};

describe('ScheduledReleasePage', () => {
  it('renders the release title and artist name', () => {
    render(<ScheduledReleasePage {...defaultProps} />);
    expect(screen.getAllByText('Midnight Drive').length).toBeGreaterThanOrEqual(
      1
    );
    expect(screen.getByText('Tim White')).toBeInTheDocument();
  });

  it('renders the countdown timer', () => {
    render(<ScheduledReleasePage {...defaultProps} />);
    expect(screen.getByTestId('release-countdown')).toBeInTheDocument();
  });

  it('renders the notification signup CTA', () => {
    render(<ScheduledReleasePage {...defaultProps} />);
    expect(screen.getByTestId('profile-inline-cta')).toBeInTheDocument();
  });

  it('shares the scheduled release when the share button is clicked', () => {
    shareSpy.mockClear();
    render(<ScheduledReleasePage {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /share/i }));
    expect(shareSpy).toHaveBeenCalledTimes(1);
  });

  it('links back to artist profile', () => {
    render(<ScheduledReleasePage {...defaultProps} />);
    const link = screen.getByText('Tim White');
    expect(link.closest('a')?.getAttribute('href')).toBe('/timwhite');
  });

  it('wraps content in ReleaseNotificationsProvider', () => {
    render(<ScheduledReleasePage {...defaultProps} />);
    expect(screen.getByTestId('notifications-provider')).toBeInTheDocument();
  });
});
