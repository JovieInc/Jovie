import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { Artist } from '@/types/db';
import { MysteryReleasePage } from './MysteryReleasePage';

const router = { refresh: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

// The sign-up and its notifications context are covered by their own suites.
vi.mock('@/features/profile/artist-notifications-cta', () => ({
  ProfileInlineNotificationsCTA: ({ artist }: { artist: Artist }) => (
    <button type='button'>Get notified about {artist.name}</button>
  ),
}));
vi.mock('./ReleaseNotificationsProvider', () => ({
  ReleaseNotificationsProvider: ({ children }: { children: ReactNode }) =>
    children,
}));

const ARTIST = {
  id: 'artist-1',
  name: 'Tim White',
  handle: 'tim',
  avatarUrl: null,
};
const IN_FIVE_DAYS = () => new Date(Date.now() + 5 * 86_400_000 + 60_000);

describe('MysteryReleasePage', () => {
  afterEach(cleanup);

  it('hides the release behind blank art and counts down to the reveal', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MysteryReleasePage revealDate={IN_FIVE_DAYS()} artist={ARTIST} />
    );

    expect(screen.getByText('Reveals In')).toBeVisible();
    expect(screen.getByText('days')).toBeVisible();
    expect(container.querySelector('svg.lucide-audio-lines')).toBeTruthy();
    expect(screen.queryByRole('img', { name: /artwork/ })).toBeNull();
    const artist = screen.getByRole('link', { name: 'Tim White' });
    expect(artist).toHaveAttribute('href', '/tim');
    await user.tab();
    expect(artist).toHaveFocus();
    expect(
      screen.getByRole('button', { name: 'Get notified about Tim White' })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('locks the free plan to the on-media teaser card with no countdown or sign-up', async () => {
    const { container } = render(
      <MysteryReleasePage revealDate={IN_FIVE_DAYS()} artist={ARTIST} minimal />
    );

    expect(screen.queryByTestId('release-countdown')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    const teaser = screen.getByText('Something new coming soon');
    expect(teaser.parentElement).toHaveClass(
      'bg-on-media/10',
      'ring-on-media/[0.08]'
    );
    await expectNoA11yViolations(container);
  });

  it('wraps a long artist name without axe violations', async () => {
    const name = 'Tim White, The Midnight Strings Orchestra and Friends';
    const { container } = render(
      <MysteryReleasePage
        revealDate={IN_FIVE_DAYS()}
        artist={{ ...ARTIST, name }}
      />
    );
    expect(screen.getByRole('link', { name })).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('renders in a right-to-left page without axe violations', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <MysteryReleasePage
          revealDate={IN_FIVE_DAYS()}
          artist={{ ...ARTIST, name: 'تيم وايت' }}
        />
      </div>
    );
    expect(screen.getByRole('link', { name: 'تيم وايت' })).toHaveAttribute(
      'href',
      '/tim'
    );
    await expectNoA11yViolations(container);
  });
});
