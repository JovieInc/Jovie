import { render, screen } from '@testing-library/react';
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
import { MysteryReleasePage } from '@/features/release/MysteryReleasePage';

const defaultProps = {
  revealDate: new Date(Date.now() + 86_400_000),
  artist: {
    id: 'artist-123',
    name: 'Tim White',
    handle: 'timwhite',
    avatarUrl: 'https://example.com/avatar.jpg',
  },
};

describe('MysteryReleasePage', () => {
  it('renders "Upcoming release" text', () => {
    render(<MysteryReleasePage {...defaultProps} />);
    expect(screen.getByText('Upcoming release')).toBeInTheDocument();
  });

  it('renders artist name as link to /${handle}', () => {
    render(<MysteryReleasePage {...defaultProps} />);
    const link = screen.getByText('Tim White');
    expect(link.closest('a')?.getAttribute('href')).toBe('/timwhite');
  });

  it('shows countdown when minimal is false (default)', () => {
    render(<MysteryReleasePage {...defaultProps} />);
    expect(screen.getByTestId('release-countdown')).toBeInTheDocument();
  });

  it('shows notification CTA when minimal is false', () => {
    render(<MysteryReleasePage {...defaultProps} />);
    expect(screen.getByTestId('profile-inline-cta')).toBeInTheDocument();
  });

  it('shows "Something new coming soon" when minimal is true', () => {
    render(<MysteryReleasePage {...defaultProps} minimal />);
    expect(screen.getByText('Something new coming soon')).toBeInTheDocument();
  });

  it('hides countdown and CTA when minimal is true', () => {
    render(<MysteryReleasePage {...defaultProps} minimal />);
    expect(screen.queryByTestId('release-countdown')).toBeNull();
    expect(screen.queryByTestId('profile-inline-cta')).toBeNull();
  });

  it('wraps content in ReleaseNotificationsProvider', () => {
    render(<MysteryReleasePage {...defaultProps} />);
    expect(screen.getByTestId('notifications-provider')).toBeInTheDocument();
  });
});
