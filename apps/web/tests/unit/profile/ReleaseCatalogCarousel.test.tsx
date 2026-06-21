import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityCardModel } from '@/components/organisms/entity-card/types';
import { ReleaseCatalogCarousel } from '@/features/profile/ReleaseCatalogCarousel';

const { trackMock } = vi.hoisted(() => ({
  trackMock: vi.fn(),
}));

class MockIntersectionObserver {
  private readonly callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    this.callback(
      [
        {
          isIntersecting: true,
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
    ...props
  }: {
    readonly children: React.ReactNode;
    readonly href: string;
    readonly onClick?: () => void;
    readonly [key: string]: unknown;
  }) => (
    <a href={href} onClick={onClick} {...props}>
      {children}
    </a>
  ),
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

describe('ReleaseCatalogCarousel', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
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
});
