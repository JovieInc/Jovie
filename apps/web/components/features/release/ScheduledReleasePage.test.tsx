import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

type LinkProps = {
  readonly href: string;
  readonly children: ReactNode;
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

vi.mock('./ReleaseNotificationsProvider', () => ({
  ReleaseNotificationsProvider: ({
    children,
  }: {
    readonly children: ReactNode;
  }) => <div data-testid='notifications-provider'>{children}</div>,
}));

vi.mock('@/features/profile/artist-notifications-cta', () => ({
  ProfileInlineNotificationsCTA: () => (
    <div data-testid='profile-inline-cta'>Turn on notifications</div>
  ),
}));

const { shareSpy } = vi.hoisted(() => ({ shareSpy: vi.fn() }));

vi.mock('@/features/share/PublicShareMenu', () => ({
  PublicShareMenu: ({ trigger }: { readonly trigger: ReactNode }) =>
    isValidElement(trigger)
      ? cloneElement(trigger as ReactElement<{ onClick?: () => void }>, {
          onClick: () => shareSpy(),
        })
      : null,
}));

vi.mock('./ReleaseCountdown', () => ({
  ReleaseCountdown: () => <span data-testid='release-countdown-inner' />,
}));

vi.mock('./SmartLinkPagePrimitives', () => ({
  SmartLinkArtworkCard: ({ title }: { readonly title: string }) => (
    <div data-testid='artwork-card'>{title}</div>
  ),
  SmartLinkPageFrame: ({ children }: { readonly children: ReactNode }) => (
    <main>{children}</main>
  ),
}));

import { ScheduledReleasePage } from './ScheduledReleasePage';

const DAY_MS = 24 * 60 * 60 * 1000;

function props(title = 'Midnight Drive', name = 'Tim White') {
  return {
    release: {
      slug: 'midnight-drive',
      title,
      artworkUrl: null,
      releaseDate: new Date(Date.now() + DAY_MS).toISOString(),
    },
    artist: {
      id: 'artist-123',
      name,
      handle: 'timwhite',
      avatarUrl: null,
    },
  };
}

describe('ScheduledReleasePage', () => {
  beforeEach(() => {
    shareSpy.mockReset();
  });

  it('renders the title, artist link, countdown panel and notifications CTA', async () => {
    const { container } = render(<ScheduledReleasePage {...props()} />);

    expect(
      screen.getByRole('heading', { name: 'Midnight Drive' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tim White' })).toHaveAttribute(
      'href',
      '/timwhite'
    );
    expect(screen.getByTestId('release-countdown')).toHaveClass(
      'border-on-media/8',
      'bg-on-media/5'
    );
    expect(screen.getByTestId('profile-inline-cta')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('opens sharing from the design-system Share trigger', async () => {
    const user = userEvent.setup();
    const { container } = render(<ScheduledReleasePage {...props()} />);

    const share = screen.getByRole('button', { name: 'Share' });
    expect(share).toHaveAttribute('data-slot', 'plain-button');
    await user.click(share);
    expect(shareSpy).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('keeps a long title and an RTL artist name readable', async () => {
    const title =
      'An Extended Deluxe Edition With A Very Long Release Title That Keeps Going';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ScheduledReleasePage {...props(title, 'ليلى أحمد')} />
      </div>
    );

    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ليلى أحمد' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
