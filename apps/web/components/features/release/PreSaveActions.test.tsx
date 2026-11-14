import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { Artist } from '@/types/db';
import { PreSaveActions } from './PreSaveActions';

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
const router = { refresh };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

vi.mock('@/features/profile/artist-notifications-cta', () => ({
  ProfileInlineNotificationsCTA: ({ artist }: { artist: Artist }) => (
    <button type='button'>Get notified about {artist.name}</button>
  ),
}));

const NOW = new Date('2031-04-16T16:00:00.000Z');
const ARTIST: Artist = {
  id: 'artist-1',
  owner_user_id: '',
  handle: 'tim',
  spotify_id: '',
  name: 'Tim White',
  published: true,
  is_verified: false,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '',
};

describe('PreSaveActions', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    refresh.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows the compact countdown in its on-media pill above the notification sign-up', async () => {
    const { container } = render(
      <PreSaveActions
        releaseDate={new Date('2031-04-20T18:30:00.000Z')}
        artistData={ARTIST}
      />
    );
    const pill = screen.getByTestId('release-countdown');
    expect(pill).toHaveClass(
      'border-on-media/[0.08]',
      'bg-on-media/[0.05]',
      'backdrop-blur-2xl'
    );
    expect(pill).toHaveTextContent('4D2H30M');
    expect(
      screen.getByRole('button', { name: 'Get notified about Tim White' })
    ).toBeVisible();
    vi.useRealTimers();
    await expectNoA11yViolations(container);
  });

  it('ticks the countdown down every minute', () => {
    render(
      <PreSaveActions
        releaseDate={new Date('2031-04-16T16:02:30.000Z')}
        artistData={ARTIST}
      />
    );
    const pill = screen.getByTestId('release-countdown');
    expect(pill).toHaveTextContent('0H2M');
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(pill).toHaveTextContent('0H1M');
  });

  it('leaves the pill empty and refreshes once the release time has passed', async () => {
    const { container } = render(
      <PreSaveActions
        releaseDate={new Date('2031-04-16T15:59:00.000Z')}
        artistData={ARTIST}
      />
    );
    expect(screen.getByTestId('release-countdown')).toBeEmptyDOMElement();
    expect(refresh).toHaveBeenCalledOnce();
    vi.useRealTimers();
    await expectNoA11yViolations(container);
  });
});
