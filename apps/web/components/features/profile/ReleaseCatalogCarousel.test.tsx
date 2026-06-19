import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { PublicRelease } from './releases/types';

// Mocks required for component tree
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    readonly children: React.ReactNode;
    readonly href: string;
    readonly [key: string]: unknown;
  }) => React.createElement('a', { href, ...props }, children),
}));

vi.mock('next/image', () => ({
  default: ({
    alt,
    src,
    fill: _fill,
    sizes: _sizes,
    priority: _priority,
    ...props
  }: {
    readonly alt: string;
    readonly src: string;
    readonly fill?: boolean;
    readonly sizes?: string;
    readonly priority?: boolean;
    readonly [key: string]: unknown;
  }) => React.createElement('img', { alt, src, ...props }),
}));

vi.mock('@/hooks/useSwipeMode', () => ({
  useSwipeMode: vi.fn().mockReturnValue({
    activeIndex: 0,
    containerRef: { current: null },
    dragOffset: 0,
    isDragging: false,
    setActiveIndex: vi.fn(),
    handlers: {
      onTouchStart: vi.fn(),
      onTouchMove: vi.fn(),
      onTouchEnd: vi.fn(),
    },
  }),
}));

// ResizeObserver is not available in jsdom; arrow fns can't be constructors
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(_callback: ResizeObserverCallback) {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// Import after mocks are set up
const { ReleaseCatalogCarousel } = await import('./ReleaseCatalogCarousel');

const makeRelease = (
  id: string,
  slug: string,
  title: string
): PublicRelease => ({
  id,
  title,
  slug,
  releaseType: 'single',
  releaseDate: '2024-01-01',
  artworkUrl: null,
  artistNames: ['Test Artist'],
});

const PRIMARY_CARD = <div data-testid='primary-card'>Primary</div>;

describe('ReleaseCatalogCarousel', () => {
  it('renders primary card directly when there are no catalog releases', () => {
    render(
      <ReleaseCatalogCarousel
        primaryCard={PRIMARY_CARD}
        catalogReleases={[]}
        artistHandle='test-artist'
      />
    );

    expect(screen.getByTestId('primary-card')).toBeInTheDocument();
    expect(
      screen.queryByTestId('release-catalog-carousel')
    ).not.toBeInTheDocument();
  });

  it('renders carousel wrapper when catalog releases exist', () => {
    const catalogReleases: PublicRelease[] = [
      makeRelease('r2', 'old-song', 'Old Song'),
      makeRelease('r3', 'older-song', 'Older Song'),
    ];

    render(
      <ReleaseCatalogCarousel
        primaryCard={PRIMARY_CARD}
        catalogReleases={catalogReleases}
        artistHandle='test-artist'
      />
    );

    expect(screen.getByTestId('release-catalog-carousel')).toBeInTheDocument();
    expect(screen.getByTestId('primary-card')).toBeInTheDocument();
    expect(screen.getByTestId('catalog-release-card-r2')).toBeInTheDocument();
    expect(screen.getByTestId('catalog-release-card-r3')).toBeInTheDocument();
  });

  it('links catalog cards to /{artistHandle}/{release.slug}', () => {
    const catalogReleases: PublicRelease[] = [
      makeRelease('r2', 'old-song', 'Old Song'),
    ];

    render(
      <ReleaseCatalogCarousel
        primaryCard={PRIMARY_CARD}
        catalogReleases={catalogReleases}
        artistHandle='test-artist'
      />
    );

    const listenLink = screen
      .getByTestId('catalog-release-card-r2')
      .querySelector('a[href="/test-artist/old-song"]');
    expect(listenLink).toBeInTheDocument();
  });

  it('shows release title in catalog cards', () => {
    const catalogReleases: PublicRelease[] = [
      makeRelease('r2', 'my-hit', 'My Big Hit'),
    ];

    render(
      <ReleaseCatalogCarousel
        primaryCard={PRIMARY_CARD}
        catalogReleases={catalogReleases}
        artistHandle='test-artist'
      />
    );

    expect(screen.getByText('My Big Hit')).toBeInTheDocument();
  });
});
