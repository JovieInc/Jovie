import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityCardModel } from '@/components/organisms/entity-card/types';
import { ReleaseCatalogCarousel } from '@/features/profile/ReleaseCatalogCarousel';

const { trackMock, intersectionThresholds, intersectionRatio } = vi.hoisted(
  () => ({
    trackMock: vi.fn(),
    intersectionThresholds: [] as Array<number | number[] | undefined>,
    intersectionRatio: { current: 1 },
  })
);

class MockIntersectionObserver {
  private readonly callback: IntersectionObserverCallback;

  constructor(
    callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit
  ) {
    this.callback = callback;
    intersectionThresholds.push(options?.threshold);
  }

  observe(target: Element) {
    this.callback(
      [
        {
          isIntersecting: true,
          intersectionRatio: intersectionRatio.current,
          target,
        } as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver
    );
  }

  disconnect() {}
  unobserve() {}
}

vi.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => trackMock(...args),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    onClick,
    prefetch,
    ...props
  }: {
    readonly children: React.ReactNode;
    readonly href: string;
    readonly onClick?: () => void;
    readonly prefetch?: boolean;
    readonly [key: string]: unknown;
  }) => {
    void prefetch;
    return (
      <a href={href} onClick={onClick} {...props}>
        {children}
      </a>
    );
  },
}));

vi.mock('@/components/atoms/ImageWithFallback', () => ({
  ImageWithFallback: ({
    alt,
    src,
  }: {
    readonly alt: string;
    readonly src?: string | null;
  }) => <img alt={alt} src={src ?? undefined} />,
}));

const featuredRelease: EntityCardModel = {
  id: 'the-deep-end',
  releaseId: 'release-featured',
  kind: 'music',
  href: '/tim/the-deep-end',
  imageUrl: '/img/releases/the-deep-end.jpg',
  imageAlt: 'The Deep End artwork',
  title: 'The Deep End',
  cta: { label: 'Listen', href: '/tim/the-deep-end' },
};

const catalogRelease: EntityCardModel = {
  id: 'under-lights',
  releaseId: 'release-catalog',
  kind: 'music',
  href: '/tim/under-lights',
  imageUrl: '/img/releases/under-lights.jpg',
  imageAlt: 'Under Lights artwork',
  title: 'Under Lights',
  cta: { label: 'Listen', href: '/tim/under-lights' },
};

const playlistFallback: EntityCardModel = {
  id: 'playlist-this-is-tim',
  kind: 'music',
  href: 'https://open.spotify.com/playlist/this-is-tim',
  imageUrl: '/img/playlists/this-is-tim.jpg',
  imageAlt: 'This Is Tim playlist cover',
  title: 'This Is Tim',
  cta: {
    label: 'Open Playlist',
    href: 'https://open.spotify.com/playlist/this-is-tim',
    external: true,
  },
};

describe('ReleaseCatalogCarousel', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    intersectionThresholds.length = 0;
    intersectionRatio.current = 1;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    trackMock.mockClear();
  });

  it('tracks per-card impressions when cards become visible', () => {
    render(
      <ReleaseCatalogCarousel
        items={[featuredRelease, catalogRelease]}
        artistHandle='tim'
        artistId='artist-1'
      />
    );

    expect(trackMock).toHaveBeenCalledWith(
      'catalog_carousel_card_impression',
      expect.objectContaining({
        release_id: 'release-featured',
        index: 0,
        artist_handle: 'tim',
        is_featured: true,
      })
    );
    expect(trackMock).toHaveBeenCalledWith(
      'catalog_carousel_card_impression',
      expect.objectContaining({
        release_id: 'release-catalog',
        index: 1,
        artist_handle: 'tim',
        is_featured: false,
      })
    );
    expect(intersectionThresholds).toContain(0.5);
  });

  it('waits for half the card to be visible before recording an impression', () => {
    intersectionRatio.current = 0.49;

    render(
      <ReleaseCatalogCarousel
        items={[featuredRelease]}
        artistHandle='tim'
        artistId='artist-1'
      />
    );

    expect(trackMock).not.toHaveBeenCalled();
    expect(
      screen
        .getByTestId('profile-home-carousel')
        .querySelector('[data-carousel-index="0"]')
    ).toHaveAttribute('data-edge', 'true');
  });

  it('uses the profile landscape rail without changing release analytics geometry', () => {
    render(
      <ReleaseCatalogCarousel
        items={[featuredRelease, catalogRelease]}
        artistHandle='tim'
        artistId='artist-1'
      />
    );

    const carousel = screen.getByTestId('profile-home-carousel');
    expect(carousel).toHaveAttribute('data-layout', 'profile-landscape');
    expect(carousel.className).toContain('snap-mandatory');

    const footprints = [...carousel.querySelectorAll(':scope > li')];
    expect(footprints).toHaveLength(2);
    expect(
      footprints.every(
        footprint =>
          footprint.className.includes('w-full') &&
          footprint.className.includes('snap-always')
      )
    ).toBe(true);

    const artwork = screen.getByRole('img', {
      name: 'The Deep End artwork',
    });
    expect(artwork.parentElement?.className).toContain('aspect-square');
    expect(artwork.parentElement?.className).toMatch(/(?:^|\s)rounded(?:\s|$)/);
    expect(artwork.parentElement?.className).not.toContain('border-r');
    expect(screen.getAllByText('Listen')[0]?.className).toContain('h-8');
  });

  it('tracks listen CTA clicks with release context', () => {
    render(
      <ReleaseCatalogCarousel
        items={[featuredRelease, catalogRelease]}
        artistHandle='tim'
        artistId='artist-1'
      />
    );

    trackMock.mockClear();

    const link = screen.getByRole('link', { name: /Under Lights/i });
    link.addEventListener('click', event => event.preventDefault());
    fireEvent.click(link);

    expect(trackMock).toHaveBeenCalledWith(
      'catalog_carousel_listen_click',
      expect.objectContaining({
        release_id: 'release-catalog',
        index: 1,
        artist_handle: 'tim',
        cta_location: 'catalog_carousel',
      })
    );
  });

  it('does not emit analytics when analytics are disabled', () => {
    render(
      <ReleaseCatalogCarousel
        items={[featuredRelease]}
        artistHandle='tim'
        artistId='artist-1'
        analyticsEnabled={false}
      />
    );

    trackMock.mockClear();

    const link = screen.getByRole('link', { name: /The Deep End/i });
    link.addEventListener('click', event => event.preventDefault());
    fireEvent.click(link);

    expect(trackMock).not.toHaveBeenCalled();
  });

  it('does not track music-like cards without a release id', () => {
    render(
      <ReleaseCatalogCarousel
        items={[playlistFallback]}
        artistHandle='tim'
        artistId='artist-1'
      />
    );

    expect(trackMock).not.toHaveBeenCalled();

    const link = screen.getByRole('link', { name: /This Is Tim/i });
    link.addEventListener('click', event => event.preventDefault());
    fireEvent.click(link);

    expect(trackMock).not.toHaveBeenCalled();
  });
});
