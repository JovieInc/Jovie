import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AvailableDSP } from '@/lib/dsp';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { LegacySocialLink } from '@/types/db';
import { ProfilePrimaryCTA } from './ProfilePrimaryCTA';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';

const viewport = vi.hoisted(() => ({ mobile: false }));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    prefetch: _prefetch,
    ...rest
  }: {
    readonly href: string;
    readonly children: ReactNode;
    readonly prefetch?: boolean;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: () => viewport.mobile,
}));

vi.mock(
  '@/features/profile/artist-notifications-cta/ArtistNotificationsCTA',
  () => ({ ArtistNotificationsCTA: () => <p>Alerts capture</p> })
);

vi.mock(
  '@/features/profile/artist-notifications-cta/TwoStepNotificationsCTA',
  () => ({ TwoStepNotificationsCTA: () => <p>Two-step capture</p> })
);

vi.mock('./ListenDrawer', () => ({
  ListenDrawer: ({
    open,
    onOpenChange,
  }: {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div role='dialog' aria-label='Listen links'>
        <button type='button' onClick={() => onOpenChange(false)}>
          Close listen links
        </button>
      </div>
    ) : null,
}));

// The drawer is mocked, so only the link fields matter here.
const DSP = {
  key: 'spotify',
  name: 'Spotify',
  url: 'https://open.spotify.com/artist/4u',
} as unknown as AvailableDSP;

function link(platform: string, url: string): LegacySocialLink {
  return {
    id: `link-${platform}`,
    artist_id: PROFILE_STORY_ARTIST.id,
    platform,
    url,
    clicks: 0,
    created_at: '2026-04-24T00:00:00.000Z',
  };
}

afterEach(() => {
  viewport.mobile = false;
});

describe('ProfilePrimaryCTA certificate', () => {
  it('opens and closes the mobile listen drawer from the listen button', async () => {
    viewport.mobile = true;
    const user = userEvent.setup();
    const { container } = render(
      <ProfilePrimaryCTA
        artist={PROFILE_STORY_ARTIST}
        socialLinks={[]}
        spotifyPreferred={false}
        showCapture={false}
        mergedDSPs={[DSP]}
      />
    );

    const listen = screen.getByRole('button', {
      name: 'Open music streaming links',
    });
    expect(listen).toHaveTextContent('Listen now');
    expect(listen).toHaveAttribute('type', 'button');
    expect(listen).toHaveClass('max-w-sm');
    await expectNoA11yViolations(container);

    await user.click(listen);
    expect(screen.getByRole('dialog', { name: 'Listen links' })).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Close listen links' })
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('links to the listen page on desktop when no other action applies', async () => {
    const { container } = render(
      <ProfilePrimaryCTA
        artist={PROFILE_STORY_ARTIST}
        socialLinks={[]}
        spotifyPreferred={false}
        showCapture={false}
        mergedDSPs={[DSP]}
      />
    );

    expect(
      screen.getByRole('link', {
        name: 'Listen now — Open Listen page with music links',
      })
    ).toHaveAttribute('href', '/timwhite/listen');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('prefers tickets, then merch, then a preferred Spotify link', async () => {
    const { container, rerender } = render(
      <ProfilePrimaryCTA
        artist={PROFILE_STORY_ARTIST}
        socialLinks={[
          link('bandcamp', 'https://timwhite.bandcamp.com'),
          link('bandsintown', 'https://bandsintown.com/a/1'),
        ]}
        spotifyPreferred
        showCapture={false}
      />
    );
    expect(screen.getByRole('link', { name: 'Find tickets' })).toHaveAttribute(
      'href',
      'https://bandsintown.com/a/1'
    );
    await expectNoA11yViolations(container);

    rerender(
      <ProfilePrimaryCTA
        artist={PROFILE_STORY_ARTIST}
        socialLinks={[link('bandcamp', 'https://timwhite.bandcamp.com')]}
        spotifyPreferred
        showCapture={false}
      />
    );
    expect(screen.getByRole('link', { name: 'Shop merch' })).toHaveAttribute(
      'href',
      'https://timwhite.bandcamp.com'
    );

    rerender(
      <ProfilePrimaryCTA
        artist={PROFILE_STORY_ARTIST}
        socialLinks={[link('spotify', 'https://open.spotify.com/artist/4u')]}
        spotifyPreferred
        showCapture={false}
      />
    );
    expect(
      screen.getByRole('link', { name: 'Open in Spotify' })
    ).toHaveAttribute('href', 'https://open.spotify.com/artist/4u');
  });

  it('keeps the right-to-left listen link axe-clean', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ProfilePrimaryCTA
          artist={PROFILE_STORY_ARTIST}
          socialLinks={[]}
          spotifyPreferred={false}
          showCapture={false}
        />
      </div>
    );

    expect(
      screen.getByRole('link', {
        name: 'Listen now — Open Listen page with music links',
      })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
