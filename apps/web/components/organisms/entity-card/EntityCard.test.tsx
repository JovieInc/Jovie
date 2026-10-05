import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfilePacCard } from '@/components/features/profile/pac/ProfilePacCard';
import { DEFAULT_PROFILE_PAC_ASSIGNMENT } from '@/lib/flags/profile-pac';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import type { Artist } from '@/types/db';
import { EntityCard } from './EntityCard';
import type { EntityCardModel } from './types';

const mockUseTrackAudioPlayer = vi.hoisted(() => vi.fn());
const mockPacEmit = vi.hoisted(() => vi.fn());
const mockGetCaptureDismissalStatus = vi.hoisted(() => vi.fn());
const mockSubscribeToNotifications = vi.hoisted(() => vi.fn());

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    prefetch: _prefetch,
    ...props
  }: {
    readonly children: React.ReactNode;
    readonly href: string;
    readonly prefetch?: boolean;
    readonly [key: string]: unknown;
  }) => React.createElement('a', { href, ...props }, children),
}));

vi.mock('@/components/atoms/ImageWithFallback', () => ({
  ImageWithFallback: ({
    alt,
    className,
    priority,
    src,
  }: {
    readonly alt: string;
    readonly className?: string;
    readonly priority?: boolean;
    readonly src: string;
  }) =>
    React.createElement('img', {
      alt,
      className,
      'data-priority': priority ? 'true' : 'false',
      src,
    }),
}));

vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () => ({
  useTrackAudioPlayer: () => mockUseTrackAudioPlayer(),
}));

vi.mock('@/features/profile/usePacEvents', () => ({
  usePacEvents: () => ({
    exposureRef: vi.fn(),
    emit: mockPacEmit,
    createPlayTracker: () => ({
      onPlay: vi.fn(),
      onPause: vi.fn(),
      onTick: vi.fn(),
      onComplete: vi.fn(),
    }),
  }),
}));

vi.mock('@/lib/profile/capture-dismissal-client', () => ({
  getCaptureDismissalStatus: mockGetCaptureDismissalStatus,
  invalidateCaptureDismissalStatus: vi.fn(),
  handleCaptureDismissalResponse: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/notifications/client', () => ({
  subscribeToNotifications: mockSubscribeToNotifications,
}));

const merchModel: EntityCardModel = {
  id: 'm1',
  kind: 'merch',
  href: '/tim/merch/m1',
  imageUrl: 'https://cdn.test/tee.jpg',
  imageAlt: 'Tour Tee',
  eyebrow: 'Merch',
  title: 'Tour Tee 2026',
  meta: 'Premium tee',
  status: { label: 'Live', tone: 'live' },
  price: { display: '$45.00', profit: '$11.87' },
  cta: { label: 'Shop', href: '/tim/merch/m1' },
};

const pacArtist = {
  id: 'artist-1',
  handle: 'tim',
  name: 'Tim White',
  image_url: '/artist.jpg',
} as Artist;

describe('EntityCard', () => {
  it('links the whole card and renders title, price and CTA', () => {
    render(<EntityCard model={merchModel} treatment='detailed' />);
    expect(screen.getByTestId('entity-card-merch')).toHaveAttribute(
      'href',
      '/tim/merch/m1'
    );
    expect(
      screen.getByRole('heading', { name: 'Tour Tee 2026' })
    ).toBeInTheDocument();
    expect(screen.getByText('$45.00')).toBeInTheDocument();
    expect(screen.getByText('Shop')).toBeInTheDocument();
  });

  it('keeps editorial helper lines outside paragraph anatomy', () => {
    render(<EntityCard model={merchModel} treatment='detailed' />);
    expect(screen.getByText('Premium tee').tagName).toBe('SPAN');
    expect(screen.getByText('Profit $11.87').tagName).toBe('SPAN');
  });

  it('hides the status pill in the compact treatment (progressive disclosure)', () => {
    render(<EntityCard model={merchModel} treatment='compact' />);
    expect(screen.queryByText('Live')).not.toBeInTheDocument();
    render(<EntityCard model={merchModel} treatment='detailed' />);
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('renders a date pill instead of an image for shows without artwork', () => {
    const show: EntityCardModel = {
      id: 's1',
      kind: 'show',
      title: 'The Echo',
      imageAlt: 'The Echo',
      datePill: { month: 'Jul', day: '4' },
    };
    render(<EntityCard model={show} treatment='compact' />);
    expect(screen.getByText('Jul')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    // JOV-INV-019 image-contrast: the pill sits on the card's own gradient
    // artStyle background, so the date text needs a guaranteed-opaque well
    // (bg-surface-0) underneath it, not a translucent one.
    const dayPill = screen.getByText('4').closest('div');
    expect(dayPill).toHaveClass('bg-surface-0');
  });

  it('renders a plain container when there is no href or cta target', () => {
    const noLink: EntityCardModel = {
      id: 'x',
      kind: 'music',
      title: 'Demo',
      imageAlt: 'Demo',
    };
    render(<EntityCard model={noLink} />);
    const el = screen.getByTestId('entity-card-music');
    expect(el.tagName).toBe('DIV');
  });

  it('renders interactive CTAs as real controls instead of a whole-card link', () => {
    const onCalendar = vi.fn();
    const interactive: EntityCardModel = {
      id: 't1',
      kind: 'show',
      title: 'Live',
      imageAlt: 'The Venue',
      interactive: true,
      cta: {
        label: 'Get Tickets',
        href: 'https://tickets.test/show',
        external: true,
      },
      secondaryCta: {
        label: 'Add To Calendar',
        onClick: onCalendar,
      },
    };

    render(<EntityCard model={interactive} treatment='detailed' />);
    const card = screen.getByTestId('entity-card-show');
    expect(card.tagName).toBe('DIV');
    const tickets = screen.getByRole('link', { name: 'Get Tickets' });
    const calendar = screen.getByRole('button', { name: 'Add To Calendar' });
    expect(tickets).toHaveAttribute('href', 'https://tickets.test/show');
    expect(tickets.className).toContain('h-11');
    expect(calendar.className).toContain('h-11');
    fireEvent.click(calendar);
    expect(onCalendar).toHaveBeenCalledTimes(1);
  });

  it('locks shaped cards to a fixed aspect ratio with clipped overflow (#11899)', () => {
    render(
      <EntityCard model={merchModel} treatment='compact' shape='standard' />
    );
    const card = screen.getByTestId('entity-card-merch');
    expect(card.className).toContain('aspect-card-standard');
    expect(card.className).toContain('overflow-hidden');
  });

  it('keeps the CTA footer anchored outside the clipped text zone when shaped', () => {
    render(<EntityCard model={merchModel} treatment='big' shape='standard' />);
    const cta = screen.getByText('Shop');
    // The footer row (CTA's parent) carries the bottom anchor and never sits
    // inside the overflow-hidden text block, so the button cannot shift or
    // clip regardless of title/metadata length.
    const footer = cta.parentElement as HTMLElement;
    expect(footer.className).toContain('mt-auto');
    expect(footer.className).toContain('shrink-0');
    expect(footer.className).not.toContain('overflow-hidden');
    // Title lives in the clipped text zone.
    const title = screen.getByRole('heading', { name: 'Tour Tee 2026' });
    expect((title.parentElement as HTMLElement).className).toContain(
      'overflow-hidden'
    );
  });

  it('keeps the shell padding for compact, big, landscape media, and landscape alerts', () => {
    const alerts: EntityCardModel = {
      id: 'a1',
      kind: 'alerts',
      title: 'Alerts',
      imageAlt: 'Alerts',
    };

    const compact = render(
      <EntityCard model={merchModel} treatment='compact' />
    );
    expect(compact.getByTestId('entity-card-merch').className).toContain(
      'gap-3'
    );
    expect(compact.getByTestId('entity-card-merch').className).toContain('p-3');
    compact.unmount();

    const big = render(<EntityCard model={merchModel} treatment='big' />);
    expect(big.getByTestId('entity-card-merch').className).toContain(
      'gap-0 overflow-hidden p-0'
    );
    big.unmount();

    const landscape = render(
      <EntityCard
        model={merchModel}
        treatment='detailed'
        anatomy='profile-landscape'
      />
    );
    expect(landscape.getByTestId('entity-card-merch').className).toContain(
      'gap-0 overflow-hidden p-1.5'
    );
    landscape.unmount();

    const alertCard = render(
      <EntityCard
        model={alerts}
        treatment='detailed'
        anatomy='profile-landscape'
      />
    );
    expect(alertCard.getByTestId('entity-card-alerts').className).toContain(
      'gap-0 overflow-hidden p-0'
    );
    expect(alertCard.getByTestId('entity-card-alerts').className).not.toContain(
      'p-1.5'
    );
  });

  it('keeps legacy content-driven sizing when no shape is provided', () => {
    render(<EntityCard model={merchModel} treatment='compact' />);
    const card = screen.getByTestId('entity-card-merch');
    expect(card.className).not.toContain('aspect-card-standard');
    expect(card.className).not.toContain('aspect-square');
  });

  it('renders fallback text when cta.label is empty', () => {
    const onAction = vi.fn();
    const emptyLabel: EntityCardModel = {
      id: 'e1',
      kind: 'show',
      title: 'Show',
      imageAlt: 'Venue',
      interactive: true,
      cta: {
        label: '',
        onClick: onAction,
      },
    };

    render(<EntityCard model={emptyLabel} treatment='compact' />);
    const button = screen.getByRole('button');
    expect(button).not.toHaveTextContent('');
    expect(button).toHaveTextContent('Action');
  });

  describe('unified anatomy (profile home carousel)', () => {
    it('locks the art zone to a full-bleed square with cover-fitted artwork', () => {
      render(
        <EntityCard model={merchModel} treatment='detailed' anatomy='unified' />
      );
      const image = screen.getByRole('img');
      expect(image.parentElement?.className).toContain('aspect-square');
      expect(image.className).toContain('object-cover');
      // Full-bleed: the card carries no padding around the art zone.
      const card = screen.getByTestId('entity-card-merch');
      expect(card.className).toContain('p-0');
    });

    it('fits music artwork with object-contain so the square is complete', () => {
      const music: EntityCardModel = {
        id: 'r1',
        kind: 'music',
        href: '/tim/r1',
        imageUrl: 'https://cdn.test/art.jpg',
        imageAlt: 'Art',
        title: 'Release',
        cta: { label: 'Listen', href: '/tim/r1' },
      };
      render(
        <EntityCard model={music} treatment='detailed' anatomy='unified' />
      );
      expect(screen.getByRole('img').className).toContain('object-contain');
      expect(screen.getByRole('img').className).not.toContain('object-cover');
    });

    it('renders a full-width 36px CTA and folds the price into the meta line', () => {
      render(
        <EntityCard model={merchModel} treatment='detailed' anatomy='unified' />
      );
      const cta = screen.getByText('Shop');
      expect(cta.className).toContain('h-9');
      expect(cta.className).toContain('w-full');
      // Price joins the single meta line; there is no separate price block.
      expect(screen.getByText('Premium tee · $45.00')).toBeInTheDocument();
      expect(screen.getByText('Premium tee · $45.00').tagName).toBe('SPAN');
      expect(screen.queryByText('Profit $11.87')).not.toBeInTheDocument();
    });

    it('uses a 44px action target in the profile landscape anatomy', () => {
      const interactiveMerch: EntityCardModel = {
        ...merchModel,
        href: null,
        interactive: true,
      };
      render(
        <EntityCard
          model={interactiveMerch}
          treatment='detailed'
          anatomy='profile-landscape'
        />
      );

      const cta = screen.getByText('Shop');
      expect(cta).toHaveAttribute('href', '/tim/merch/m1');
      expect(cta.className).toContain('h-11');
      expect(cta.className).toContain('flex-none');
      expect(cta.className).toContain('px-3');
      expect(cta.className).toContain('text-2xs');
    });

    it('renders a target-less CTA as plain muted meta text, not button chrome', () => {
      const noTickets: EntityCardModel = {
        id: 's9',
        kind: 'show',
        title: 'The Echo',
        imageAlt: 'The Echo',
        datePill: { month: 'Jul', day: '29' },
        cta: { label: 'No Tickets', href: null, disabled: true },
      };
      render(
        <EntityCard model={noTickets} treatment='detailed' anatomy='unified' />
      );
      const text = screen.getByText('No Tickets');
      expect(text.className).toContain('text-tertiary-token');
      expect(text.className).not.toContain('rounded-full');
      expect(text.className).not.toContain('bg-btn-primary');
    });
  });
});

describe('EntityCard source contract', () => {
  it('uses inline helper anatomy for meta and profit details', () => {
    const source = readFileSync(resolve(__dirname, './EntityCard.tsx'), 'utf8');

    expect(source).toContain(
      "'block min-w-0 truncate text-xs text-tertiary-token'"
    );
    expect(source).toContain(
      "<span className='block text-2xs text-tertiary-token'>"
    );
    expect(source).not.toContain(
      "<p className='text-2xs text-tertiary-token'>"
    );
  });
});

describe('ProfilePacCard landscape states', () => {
  beforeEach(() => {
    mockPacEmit.mockClear();
    mockGetCaptureDismissalStatus.mockReset();
    mockGetCaptureDismissalStatus.mockResolvedValue(null);
    mockSubscribeToNotifications.mockReset();
    mockUseTrackAudioPlayer.mockReturnValue({
      playbackState: {
        activeTrackId: 'pac-artist-1-release',
        currentTime: 30,
        duration: 60,
        isPlaying: true,
      },
      toggleTrack: vi.fn(),
      seek: vi.fn(),
    });
  });

  it('never prompts, submits, or emits capture events when capture is disabled', async () => {
    render(
      <ProfilePacCard
        artist={pacArtist}
        release={{
          title: 'Release',
          slug: 'release',
          artworkUrl: '/release.jpg',
          previewUrl: '/preview.mp3',
        }}
        assignment={DEFAULT_PROFILE_PAC_ASSIGNMENT}
        layout='profile-landscape'
        captureEnabled={false}
      />
    );

    const card = screen.getByTestId('profile-pac');
    await waitFor(() => expect(card).toHaveAttribute('data-state', 'idle'));
    expect(screen.getByRole('slider', { name: 'Seek Track' })).toBeEnabled();
    expect(
      screen.queryByRole('textbox', { name: /email address/i })
    ).toBeNull();
    expect(mockGetCaptureDismissalStatus).not.toHaveBeenCalled();
    expect(mockSubscribeToNotifications).not.toHaveBeenCalled();
    expect(
      mockPacEmit.mock.calls.some(([eventName]) =>
        String(eventName).startsWith('capture_')
      )
    ).toBe(false);
  });

  it('labels an upcoming ticketed show with the generalized Events copy', () => {
    render(
      <ProfilePacCard
        artist={pacArtist}
        assignment={DEFAULT_PROFILE_PAC_ASSIGNMENT}
        layout='profile-landscape'
        renderMode='preview'
        captureEnabled={false}
        hasPlayableDestinations={false}
        nextShow={
          {
            id: 'show-1',
            title: 'Night One',
            venueName: 'The Venue',
            city: 'Los Angeles',
            ticketUrl: 'https://tickets.test/night-one',
          } as unknown as TourDateViewModel
        }
      />
    );

    expect(screen.getByTestId('profile-pac')).toHaveAttribute(
      'data-state',
      'tickets'
    );
    expect(screen.getByText('Upcoming Events')).toBeInTheDocument();
    expect(screen.queryByText('On Tour')).toBeNull();
  });

  it('re-resolves when playable destinations arrive without another inventory change', async () => {
    mockUseTrackAudioPlayer.mockReturnValue({
      playbackState: {
        activeTrackId: null,
        currentTime: 0,
        duration: 0,
        isPlaying: false,
      },
      toggleTrack: vi.fn(),
      seek: vi.fn(),
    });

    const view = render(
      <ProfilePacCard
        artist={pacArtist}
        assignment={DEFAULT_PROFILE_PAC_ASSIGNMENT}
        layout='profile-landscape'
        renderMode='preview'
        captureEnabled={false}
        hasTip
        hasPlayableDestinations={false}
      />
    );
    expect(screen.getByTestId('profile-pac')).toHaveAttribute(
      'data-state',
      'tip'
    );

    view.rerender(
      <ProfilePacCard
        artist={pacArtist}
        assignment={DEFAULT_PROFILE_PAC_ASSIGNMENT}
        layout='profile-landscape'
        renderMode='preview'
        captureEnabled={false}
        hasTip
        hasPlayableDestinations
      />
    );

    await waitFor(() =>
      expect(screen.getByTestId('profile-pac')).toHaveAttribute(
        'data-state',
        'idle'
      )
    );
    expect(screen.getByRole('link', { name: 'Listen' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Manage' })).toBeNull();
  });

  it('renders the listen slot as flat glass while conversion actions stay solid', async () => {
    mockUseTrackAudioPlayer.mockReturnValue({
      playbackState: {
        activeTrackId: null,
        currentTime: 0,
        duration: 0,
        isPlaying: false,
      },
      toggleTrack: vi.fn(),
      seek: vi.fn(),
    });

    const view = render(
      <ProfilePacCard
        artist={pacArtist}
        assignment={DEFAULT_PROFILE_PAC_ASSIGNMENT}
        layout='profile-landscape'
        renderMode='preview'
        captureEnabled={false}
        hasPlayableDestinations
      />
    );

    await waitFor(() =>
      expect(screen.getByTestId('profile-pac')).toHaveAttribute(
        'data-state',
        'idle'
      )
    );
    const listen = screen.getByRole('link', { name: 'Listen' });
    // Same material as the bottom tab bar lens; geometry and hit area unchanged.
    expect(listen).toHaveClass('profile-glass-pill', 'h-11', 'px-3');
    expect(listen).not.toHaveClass('bg-btn-primary');
    expect(listen).not.toHaveClass('shadow-sm');

    view.rerender(
      <ProfilePacCard
        artist={pacArtist}
        assignment={DEFAULT_PROFILE_PAC_ASSIGNMENT}
        layout='profile-landscape'
        renderMode='preview'
        captureEnabled={false}
        hasTip
        hasPlayableDestinations={false}
      />
    );

    await waitFor(() =>
      expect(screen.getByTestId('profile-pac')).toHaveAttribute(
        'data-state',
        'tip'
      )
    );
    const tip = screen.getByRole('link', { name: /Tip/ });
    expect(tip).toHaveClass('bg-btn-primary', 'h-11');
    expect(tip).not.toHaveClass('profile-glass-pill');
  });

  it('gives the capture form the full compact row width after the listen threshold', async () => {
    render(
      <ProfilePacCard
        artist={pacArtist}
        release={{
          title: 'Release',
          slug: 'release',
          artworkUrl: '/release.jpg',
          previewUrl: '/preview.mp3',
        }}
        assignment={DEFAULT_PROFILE_PAC_ASSIGNMENT}
        layout='profile-landscape'
        artPriority
      />
    );

    const card = screen.getByTestId('profile-pac');
    await waitFor(() => expect(card).toHaveAttribute('data-state', 'prompt'));

    const email = screen.getByRole('textbox', { name: /email address/i });
    const submit = screen.getByRole('button', { name: 'Get Updates' });
    const dismiss = screen.getByRole('button', { name: 'Not now' });
    expect(email).toBeVisible();
    expect(email).toHaveClass('h-11');
    expect(submit).toBeVisible();
    expect(submit).toHaveClass('h-11');
    expect(dismiss).toHaveClass('min-h-11', 'min-w-11');
    expect(
      screen.getByRole('img', { name: 'Release artwork' })
    ).toHaveAttribute('data-priority', 'true');
    expect(card.querySelector('.aspect-square')).toHaveClass('invisible');
    const compactContent = screen.getByRole('textbox').closest('.absolute');
    expect(compactContent).toHaveClass('inset-1.5', 'gap-1');
  });

  it('reserves enough compact-row height for subject copy and a 44px action', () => {
    mockUseTrackAudioPlayer.mockReturnValue({
      playbackState: {
        activeTrackId: null,
        currentTime: 0,
        duration: 0,
        isPlaying: false,
      },
      toggleTrack: vi.fn(),
      seek: vi.fn(),
    });

    render(
      <ProfilePacCard
        artist={pacArtist}
        release={{
          title: 'Release',
          slug: 'release',
          artworkUrl: '/release.jpg',
          previewUrl: null,
          releaseType: 'Single',
          releaseDate: '2026-08-02',
        }}
        assignment={DEFAULT_PROFILE_PAC_ASSIGNMENT}
        layout='profile-landscape'
        renderMode='preview'
      />
    );

    const card = screen.getByTestId('profile-pac');
    const compactContent = card.children.item(1);
    expect(compactContent).toHaveClass('gap-1', 'py-1.5');
    expect(screen.getByRole('link', { name: /listen/i })).toHaveClass('h-11');
  });

  it('uses the shared footer anchor contract for landscape PAC actions', () => {
    mockUseTrackAudioPlayer.mockReturnValue({
      playbackState: {
        activeTrackId: null,
        currentTime: 0,
        duration: 0,
        isPlaying: false,
      },
      toggleTrack: vi.fn(),
      seek: vi.fn(),
    });

    render(
      <ProfilePacCard
        artist={pacArtist}
        release={{
          title: 'Release',
          slug: 'release',
          artworkUrl: '/release.jpg',
          previewUrl: null,
          releaseType: 'Single',
          releaseDate: '2026-08-02',
        }}
        assignment={DEFAULT_PROFILE_PAC_ASSIGNMENT}
        layout='profile-landscape'
        renderMode='preview'
      />
    );

    const action = screen.getByRole('link', { name: /listen/i });
    expect(action.parentElement).toHaveClass('mt-auto', 'shrink-0');
  });

  it('shows the subscribed state without an error line after email signup', async () => {
    mockSubscribeToNotifications.mockResolvedValue({ ok: true });
    render(
      <ProfilePacCard
        artist={pacArtist}
        release={{
          title: 'Release',
          slug: 'release',
          artworkUrl: '/release.jpg',
          previewUrl: '/preview.mp3',
        }}
        assignment={DEFAULT_PROFILE_PAC_ASSIGNMENT}
        layout='profile-landscape'
        artPriority
      />
    );

    const card = screen.getByTestId('profile-pac');
    await waitFor(() => expect(card).toHaveAttribute('data-state', 'prompt'));
    fireEvent.change(screen.getByRole('textbox', { name: /email address/i }), {
      target: { value: 'fan@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Get Updates' }));

    await waitFor(() => expect(card).toHaveAttribute('data-state', 'success'));
    expect(screen.getByText("You're in")).toBeInTheDocument();
    expect(
      screen.getByText('Watch your inbox for Tim White updates.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/didn't go through/i)).toBeNull();
    expect(
      screen.queryByRole('textbox', { name: /email address/i })
    ).toBeNull();
    expect(mockSubscribeToNotifications).toHaveBeenCalledWith(
      expect.objectContaining({
        artistId: 'artist-1',
        channel: 'email',
        email: 'fan@example.com',
        source: 'profile_pac',
      })
    );
  });

  it('renders the featured mode card with the rotating accent and a neutral Listen now CTA', () => {
    mockUseTrackAudioPlayer.mockReturnValue({
      playbackState: {
        activeTrackId: null,
        currentTime: 0,
        duration: 0,
        isPlaying: false,
      },
      toggleTrack: vi.fn(),
      seek: vi.fn(),
    });
    render(
      <ProfilePacCard
        artist={pacArtist}
        release={{
          title: 'Never Say A Word',
          slug: 'never-say-a-word',
          artworkUrl: '/release.jpg',
          previewUrl: null,
        }}
        assignment={DEFAULT_PROFILE_PAC_ASSIGNMENT}
        layout='profile-landscape'
        presentation='featured'
        accent={{ accent: 'ultra', strength: 'art' }}
        renderMode='preview'
        captureEnabled={false}
      />
    );

    const card = screen.getByTestId('profile-pac');
    expect(card).toHaveAttribute('data-presentation', 'featured');
    const modeCard = card.querySelector('.profile-mode-card');
    expect(modeCard).toHaveAttribute('data-accent', 'ultra');
    expect(modeCard).toHaveAttribute('data-accent-strength', 'art');
    expect(modeCard).toHaveClass('min-h-80');
    expect(card).toHaveTextContent('Featured');
    expect(
      screen.getByRole('heading', { name: 'Never Say A Word' })
    ).toBeInTheDocument();
    // Featured meta is the artist, not the release type/year.
    expect(screen.getByText('Tim White')).toBeInTheDocument();
    const listen = screen.getByRole('link', { name: 'Listen now' });
    expect(listen).toHaveAttribute('href', '/tim/never-say-a-word');
    expect(listen).toHaveClass('h-11', 'w-full');
    // Neutral CTA face, not the glass slot.
    expect(listen.firstElementChild).toHaveClass('h-7', 'rounded-full');
    expect(listen.className).not.toContain('profile-glass-pill');
  });

  it('keeps the featured capture form stacked and hides the art while prompting', async () => {
    render(
      <ProfilePacCard
        artist={pacArtist}
        release={{
          title: 'Release',
          slug: 'release',
          artworkUrl: '/release.jpg',
          previewUrl: '/preview.mp3',
        }}
        assignment={DEFAULT_PROFILE_PAC_ASSIGNMENT}
        layout='profile-landscape'
        presentation='featured'
      />
    );

    const card = screen.getByTestId('profile-pac');
    await waitFor(() => expect(card).toHaveAttribute('data-state', 'prompt'));
    expect(screen.queryByTestId('profile-pac-featured-art')).toBeNull();
    expect(screen.getByText('New music, shows, and merch.')).toBeVisible();
    const email = screen.getByRole('textbox', { name: /email address/i });
    expect(email.closest('form')).toHaveClass('flex-col');
    expect(screen.getByRole('button', { name: 'Get Updates' })).toHaveClass(
      'h-11',
      'w-full'
    );
  });
});
