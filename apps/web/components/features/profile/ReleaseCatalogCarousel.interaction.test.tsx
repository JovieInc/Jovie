import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { PublicRelease } from './releases/types';

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

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(_callback: ResizeObserverCallback) {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

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

describe('ReleaseCatalogCarousel interaction', () => {
  it('exposes touch handlers and a subtle right peek without carousel chrome', () => {
    const catalogReleases: PublicRelease[] = [
      makeRelease('r2', 'old-song', 'Old Song'),
    ];

    render(
      <ReleaseCatalogCarousel
        primaryCard={<div data-testid='primary-card'>Primary</div>}
        catalogReleases={catalogReleases}
        artistHandle='test-artist'
      />
    );

    const carousel = screen.getByTestId('release-catalog-carousel');
    expect(carousel).toHaveClass('overflow-hidden');

    const track = carousel.firstElementChild as HTMLElement;
    const slides = Array.from(track.children) as HTMLElement[];
    expect(slides).toHaveLength(2);
    expect(slides[0]?.style.width).toBe('calc(100% - 24px)');
    expect(slides[1]?.style.width).toBe('calc(100% - 24px)');
    expect(
      screen.queryByRole('button', { name: /next/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('keeps the primary card full-width on first paint without carousel chrome', () => {
    render(
      <ReleaseCatalogCarousel
        primaryCard={<div data-testid='primary-card'>Primary</div>}
        catalogReleases={[]}
        artistHandle='test-artist'
      />
    );

    expect(screen.getByTestId('primary-card')).toBeInTheDocument();
    expect(
      screen.queryByTestId('release-catalog-carousel')
    ).not.toBeInTheDocument();
  });
});
