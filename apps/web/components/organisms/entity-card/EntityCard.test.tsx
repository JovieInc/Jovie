import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfilePacCard } from '@/features/profile/pac/ProfilePacCard';
import { DEFAULT_PROFILE_PAC_ASSIGNMENT } from '@/lib/flags/profile-pac';
import type { Artist } from '@/types/db';
import { EntityCard } from './EntityCard';
import type { EntityCardModel } from './types';

const mockUseTrackAudioPlayer = vi.hoisted(() => vi.fn());

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
    emit: vi.fn(),
    createPlayTracker: () => ({
      onPlay: vi.fn(),
      onPause: vi.fn(),
      onTick: vi.fn(),
      onComplete: vi.fn(),
    }),
  }),
}));

vi.mock('@/lib/profile/capture-dismissal-client', () => ({
  getCaptureDismissalStatus: vi.fn().mockResolvedValue(null),
  invalidateCaptureDismissalStatus: vi.fn(),
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
  cta: { label: 'Buy', href: '/tim/merch/m1' },
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
    expect(screen.getByText('Buy')).toBeInTheDocument();
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
    const cta = screen.getByText('Buy');
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

    it('fits music artwork with object-cover (no letterbox bands)', () => {
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
      expect(screen.getByRole('img').className).toContain('object-cover');
      expect(screen.getByRole('img').className).not.toContain('object-contain');
    });

    it('renders a full-width 36px CTA and folds the price into the meta line', () => {
      render(
        <EntityCard model={merchModel} treatment='detailed' anatomy='unified' />
      );
      const cta = screen.getByText('Buy');
      expect(cta.className).toContain('h-9');
      expect(cta.className).toContain('w-full');
      // Price joins the single meta line; there is no separate price block.
      expect(screen.getByText('Premium tee · $45.00')).toBeInTheDocument();
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

      const cta = screen.getByText('Buy');
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

describe('ProfilePacCard landscape states', () => {
  beforeEach(() => {
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
});
