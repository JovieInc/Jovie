import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityCarousel } from './EntityCarousel';
import type { EntityCardModel } from './types';

const mockUseReducedMotion = vi.fn(() => false);

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockUseReducedMotion(),
}));

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
    src,
  }: {
    readonly alt: string;
    readonly className?: string;
    readonly src: string;
  }) => React.createElement('img', { alt, className, src }),
}));

const items: EntityCardModel[] = [
  {
    id: 'release-1',
    kind: 'music',
    href: '/tim/release-1',
    imageUrl: '/release-1.jpg',
    imageAlt: 'Release one',
    title: 'Release One',
  },
  {
    id: 'release-2',
    kind: 'music',
    href: '/tim/release-2',
    imageUrl: '/release-2.jpg',
    imageAlt: 'Release two',
    title: 'Release Two',
  },
];

describe('EntityCarousel profile geometry', () => {
  beforeEach(() => {
    mockUseReducedMotion.mockReturnValue(false);
  });

  it('scopes card impressions to the carousel viewport', () => {
    const observerOptions: Array<IntersectionObserverInit | undefined> = [];
    class MockIntersectionObserver {
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();

      constructor(
        _callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit
      ) {
        observerOptions.push(options);
      }
    }
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

    try {
      render(
        <EntityCarousel
          items={items}
          dataTestId='profile-home-carousel'
          onCardImpression={vi.fn()}
        />
      );

      const carousel = screen.getByTestId('profile-home-carousel');
      expect(observerOptions[0]).toEqual({ root: carousel, threshold: 0.5 });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('fills the track height and uses the shared aspect-ratio card geometry', () => {
    render(<EntityCarousel items={items} dataTestId='profile-home-carousel' />);

    const carousel = screen.getByTestId('profile-home-carousel');
    expect(carousel.className).toContain('overflow-x-auto');
    expect(carousel.className).toContain('overflow-y-hidden');
    expect(carousel.className).toContain('profile-horizontal-rail');
    expect(carousel.className).toContain('h-full');
    expect(carousel.className).toContain('items-stretch');
    expect(carousel.className).toContain('snap-mandatory');
    expect(carousel.className).toContain('overscroll-x-contain');
    expect(carousel.className).not.toContain('touch-action');

    const footprints = [...carousel.querySelectorAll(':scope > li')];
    expect(footprints).toHaveLength(2);
    // One stable geometry for every card: the .profile-entity-card class owns
    // aspect-ratio/height/cap in design-system.css — no fixed px footprints.
    expect(
      footprints.every(
        item =>
          item.className.includes('profile-entity-card') &&
          item.className.includes('snap-always') &&
          !item.className.includes('w-56') &&
          !item.className.includes('h-96')
      )
    ).toBe(true);

    for (const card of screen.getAllByTestId('entity-card-music')) {
      expect(card.className).toContain('h-full');
      expect(card.className).toContain('overflow-hidden');
      expect(card.className).not.toContain('aspect-card-standard');
    }
  });

  it('locks the art zone to a full-width square with cover-fitted artwork', () => {
    render(<EntityCarousel items={items} />);

    for (const image of screen.getAllByRole('img')) {
      // Unified card anatomy: the art zone is a square matched to the full
      // card width (no letterbox bands), and artwork object-covers the
      // square zone — square art fills it exactly, non-square art crops.
      expect(image.parentElement?.className).toContain('aspect-square');
      expect(image.parentElement?.className).not.toContain('flex-1');
      expect(image.className).toContain('object-cover');
    }
  });

  it('renders a full-width 36px CTA at the bottom of every card', () => {
    const withCta: EntityCardModel[] = [
      {
        id: 'release-1',
        kind: 'music',
        href: '/tim/release-1',
        imageUrl: '/release-1.jpg',
        imageAlt: 'Release one',
        title: 'Release One',
        cta: { label: 'Listen', href: '/tim/release-1' },
      },
    ];
    render(<EntityCarousel items={withCta} />);

    const cta = screen.getByText('Listen');
    expect(cta.className).toContain('h-9');
    expect(cta.className).toContain('w-full');
  });

  it('renders leading and trailing slot cards in the same geometry', () => {
    render(
      <EntityCarousel
        items={items}
        dataTestId='profile-home-carousel'
        leading={<section data-testid='slot-leading' />}
        trailing={<section data-testid='slot-trailing' />}
      />
    );

    const carousel = screen.getByTestId('profile-home-carousel');
    const footprints = [...carousel.querySelectorAll(':scope > li')];
    expect(footprints).toHaveLength(4);

    const leadingLi = carousel.querySelector('[data-carousel-slot="leading"]');
    const trailingLi = carousel.querySelector(
      '[data-carousel-slot="trailing"]'
    );
    expect(leadingLi?.className).toContain('profile-entity-card');
    expect(trailingLi?.className).toContain('profile-entity-card');
    // Leading slot is the first card, trailing slot the last.
    expect(footprints[0]).toBe(leadingLi);
    expect(footprints[footprints.length - 1]).toBe(trailingLi);
    expect(leadingLi?.contains(screen.getByTestId('slot-leading'))).toBe(true);
    expect(trailingLi?.contains(screen.getByTestId('slot-trailing'))).toBe(
      true
    );
  });

  it('renders slot-only carousels (no entity items) without an empty shell', () => {
    render(
      <EntityCarousel
        items={[]}
        dataTestId='profile-home-carousel'
        leading={<section data-testid='slot-leading' />}
      />
    );

    const carousel = screen.getByTestId('profile-home-carousel');
    expect(carousel.querySelectorAll(':scope > li')).toHaveLength(1);
  });

  it('renders one full-width landscape card per mandatory snap', () => {
    const withCta: EntityCardModel[] = [
      {
        ...items[0],
        meta: 'Single · 2026',
        status: { label: 'Out Now', tone: 'live' },
        cta: { label: 'Listen', href: '/tim/release-1' },
      },
    ];

    render(
      <EntityCarousel
        items={withCta}
        layout='profile-landscape'
        dataTestId='profile-home-carousel'
      />
    );

    const carousel = screen.getByTestId('profile-home-carousel');
    expect(carousel).toHaveAttribute('data-layout', 'profile-landscape');
    expect(carousel.className).toContain('snap-mandatory');
    expect(carousel.className).toContain('gap-(--page-pad)');
    expect(carousel.className).toContain('md:gap-4');
    expect(carousel.className).not.toContain('gap-0');

    const footprint = carousel.querySelector(':scope > li');
    expect(footprint).toHaveAttribute('data-layout', 'profile-landscape');
    expect(footprint?.className).toContain('w-full');
    expect(footprint?.className).toContain('snap-always');

    const image = screen.getByRole('img', { name: 'Release one' });
    expect(image.parentElement?.className).toContain('aspect-square');
    expect(image.parentElement?.className).toMatch(/(?:^|\s)rounded(?:\s|$)/);
    expect(image.parentElement?.className).toContain('border-0');
    expect(image.parentElement?.className).not.toContain('border-r');

    const cta = screen.getByText('Listen');
    expect(cta.className).toContain('h-11');
    expect(cta.className).toContain('w-fit');
    expect(cta.className).not.toContain('w-full');
    expect(screen.getByText('Music')).toBeInTheDocument();
    expect(screen.getByText('Out Now')).toBeInTheDocument();
  });

  it('keeps landscape leading and trailing slots in identical full-width footprints', () => {
    render(
      <EntityCarousel
        items={items}
        layout='profile-landscape'
        leading={<section data-testid='slot-leading' />}
        trailing={<section data-testid='slot-trailing' />}
      />
    );

    const carousel = screen.getByTestId('entity-carousel');
    const footprints = [...carousel.querySelectorAll(':scope > li')];
    expect(footprints).toHaveLength(4);
    expect(
      footprints.every(
        footprint =>
          footprint.className.includes('w-full') &&
          footprint.getAttribute('data-layout') === 'profile-landscape'
      )
    ).toBe(true);
  });

  it('reveals restrained desktop controls for full-width landscape discovery', () => {
    render(<EntityCarousel items={items} layout='profile-landscape' />);

    const carousel = screen.getByTestId('entity-carousel');
    const scrollTo = vi.fn();
    carousel.scrollTo = scrollTo;
    const footprints = carousel.querySelectorAll(':scope > li');
    Object.defineProperty(footprints[0], 'offsetLeft', {
      configurable: true,
      value: 0,
    });
    Object.defineProperty(footprints[1], 'offsetLeft', {
      configurable: true,
      value: 320,
    });

    const previous = screen.getByRole('button', { name: 'Previous Item' });
    const next = screen.getByRole('button', { name: 'Next Item' });
    expect(carousel.parentElement).toHaveClass('h-fit');
    expect(previous).toBeDisabled();
    expect(next).toBeEnabled();
    expect(previous.className).toContain(
      '[@media(min-width:768px)_and_(hover:hover)_and_(pointer:fine)]:inline-flex'
    );
    expect(next.className).not.toContain('md:inline-flex');
    expect(previous.className).toContain('group-hover/carousel:opacity-100');
    expect(screen.getByText('Item 1 of 2')).toBeInTheDocument();

    fireEvent.click(next);

    expect(scrollTo).toHaveBeenCalledWith({
      left: 320,
      behavior: 'smooth',
    });
    expect(previous).toBeEnabled();
    expect(next).toBeDisabled();
    expect(screen.getByText('Item 2 of 2')).toBeInTheDocument();
  });

  it('coalesces scroll tracking without reading every card layout per frame', () => {
    let scheduledFrame: FrameRequestCallback | null = null;
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      scheduledFrame = callback;
      return 1;
    });
    vi.stubGlobal('ResizeObserver', undefined);
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    try {
      render(<EntityCarousel items={items} layout='profile-landscape' />);

      const carousel = screen.getByTestId('entity-carousel');
      Object.defineProperty(carousel, 'scrollWidth', {
        configurable: true,
        value: 672,
      });
      Object.defineProperty(carousel, 'clientWidth', {
        configurable: true,
        value: 320,
      });
      Object.defineProperty(carousel, 'scrollLeft', {
        configurable: true,
        value: 352,
        writable: true,
      });
      fireEvent(window, new Event('resize'));

      const geometryReads = [...carousel.children].map(child =>
        vi.spyOn(child, 'getBoundingClientRect')
      );
      fireEvent.scroll(carousel);
      fireEvent.scroll(carousel);

      expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
      expect(scheduledFrame).not.toBeNull();
      act(() => {
        if (scheduledFrame) scheduledFrame(0);
      });
      expect(screen.getByText('Item 2 of 2')).toBeInTheDocument();
      for (const geometryRead of geometryReads) {
        expect(geometryRead).not.toHaveBeenCalled();
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('uses immediate carousel navigation when reduced motion is requested', () => {
    mockUseReducedMotion.mockReturnValue(true);
    render(<EntityCarousel items={items} layout='profile-landscape' />);

    const carousel = screen.getByTestId('entity-carousel');
    const scrollTo = vi.fn();
    carousel.scrollTo = scrollTo;
    const footprints = carousel.querySelectorAll(':scope > li');
    Object.defineProperty(footprints[0], 'offsetLeft', {
      configurable: true,
      value: 0,
    });
    Object.defineProperty(footprints[1], 'offsetLeft', {
      configurable: true,
      value: 336,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Next Item' }));

    expect(scrollTo).toHaveBeenCalledWith({ left: 336, behavior: 'auto' });
  });

  it('clears edge dimming when reduced motion changes at runtime', () => {
    let observerCallback: IntersectionObserverCallback | null = null;
    const disconnect = vi.fn();
    class MockIntersectionObserver {
      observe = vi.fn();
      disconnect = disconnect;
      unobserve = vi.fn();

      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
      }
    }
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

    try {
      const view = render(
        <EntityCarousel items={items} layout='profile-landscape' />
      );
      const carousel = screen.getByTestId('entity-carousel');
      const firstCard = carousel.children[0] as HTMLElement;

      act(() => {
        observerCallback?.(
          [
            {
              target: firstCard,
              isIntersecting: false,
              intersectionRatio: 0,
              boundingClientRect: firstCard.getBoundingClientRect(),
              intersectionRect: firstCard.getBoundingClientRect(),
              rootBounds: null,
              time: 0,
            },
          ],
          {} as IntersectionObserver
        );
      });
      expect(firstCard.dataset.edge).toBe('true');

      mockUseReducedMotion.mockReturnValue(true);
      view.rerender(
        <EntityCarousel items={items} layout='profile-landscape' />
      );

      expect(disconnect).toHaveBeenCalled();
      expect(firstCard.dataset.edge).toBe('false');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('clamps desktop navigation when the available rows shrink', () => {
    const { rerender } = render(
      <EntityCarousel
        items={items}
        layout='profile-landscape'
        trailing={<section />}
      />
    );

    const carousel = screen.getByTestId('entity-carousel');
    carousel.scrollTo = vi.fn();
    fireEvent.click(screen.getByRole('button', { name: 'Next Item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next Item' }));
    expect(screen.getByText('Item 3 of 3')).toBeInTheDocument();

    rerender(<EntityCarousel items={items} layout='profile-landscape' />);

    expect(screen.getByText('Item 2 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next Item' })).toBeDisabled();
  });

  it('keeps missing artwork in the same square, subtly rounded media slot', () => {
    render(
      <EntityCarousel
        layout='profile-landscape'
        items={[
          {
            id: 'release-without-art',
            kind: 'music',
            href: '/tim/release-without-art',
            imageUrl: null,
            imageAlt: 'Release without artwork',
            title: 'A Very Long Release Title Without Artwork',
            meta: 'Single · 2026',
            cta: { label: 'Listen', href: '/tim/release-without-art' },
          },
        ]}
      />
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    const card = screen.getByTestId('entity-card-music');
    const media = card.querySelector('.aspect-square');
    expect(media?.className).toMatch(/(?:^|\s)rounded(?:\s|$)/);
    expect(media?.className).toContain('border-0');
    expect(
      screen.getByRole('heading', {
        name: 'A Very Long Release Title Without Artwork',
      })
    ).toHaveClass('line-clamp-1');
  });

  it('keeps long Unicode copy and actions bounded across every card kind', () => {
    const longTitle =
      'Álbum de medianoche 🌙 東京からサンパウロまで — edición extraordinariamente larga';
    const longAction = 'Open details ✨';
    const kinds: EntityCardModel['kind'][] = [
      'music',
      'merch',
      'show',
      'alerts',
    ];

    render(
      <EntityCarousel
        layout='profile-landscape'
        items={kinds.map((kind, index) => ({
          id: `${kind}-${index}`,
          kind,
          imageAlt: `${kind} art`,
          title: `${longTitle} ${kind}`,
          meta: `${longTitle} metadata`,
          interactive: true,
          cta: { label: longAction, onClick: vi.fn() },
        }))}
      />
    );

    for (const heading of screen.getAllByRole('heading')) {
      expect(heading).toHaveClass('line-clamp-1');
      expect(heading.parentElement).toHaveClass('overflow-hidden');
    }
    for (const action of screen.getAllByRole('button', {
      name: longAction,
    })) {
      expect(action).toHaveClass('h-11', 'flex-none');
    }
  });

  it('keeps video and product photography uncropped in landscape rows', () => {
    render(
      <EntityCarousel
        layout='profile-landscape'
        items={[
          {
            id: 'video-1',
            kind: 'video',
            imageUrl: '/video.jpg',
            imageAlt: 'Video still',
            title: 'Live Session',
          },
          {
            id: 'merch-1',
            kind: 'merch',
            imageUrl: '/shirt.jpg',
            imageAlt: 'Tour shirt',
            title: 'Tour Shirt',
          },
        ]}
      />
    );

    expect(screen.getByRole('img', { name: 'Video still' })).toHaveClass(
      'object-contain'
    );
    expect(screen.getByRole('img', { name: 'Tour shirt' })).toHaveClass(
      'object-contain'
    );
  });
});
