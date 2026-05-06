'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ProductScreenshotFrame } from '@/components/marketing/ProductScreenshotFrame';

type HeroMockupKind = 'desktop' | 'phone' | 'panel';
type CarouselDirection = -1 | 1;

interface HeroMockupShot {
  readonly id: string;
  readonly scenarioId: string;
  readonly title: string;
  readonly kind: HeroMockupKind;
  readonly priority: boolean;
  readonly ambient: {
    readonly primary: string;
    readonly secondary: string;
    readonly accent: string;
  };
}

const HERO_MOCKUP_SCREENSHOTS: readonly HeroMockupShot[] = [
  {
    id: 'release-calendar-sidebar',
    scenarioId: 'dashboard-releases-sidebar-desktop',
    title: 'Release Calendar',
    kind: 'desktop',
    priority: true,
    ambient: {
      primary: 'rgba(75, 134, 228, 0.34)',
      secondary: 'rgba(87, 188, 214, 0.18)',
      accent: 'rgba(206, 119, 72, 0.13)',
    },
  },
  {
    id: 'audience-crm',
    scenarioId: 'dashboard-audience-desktop',
    title: 'Audience CRM',
    kind: 'desktop',
    priority: false,
    ambient: {
      primary: 'rgba(80, 166, 198, 0.27)',
      secondary: 'rgba(109, 95, 215, 0.18)',
      accent: 'rgba(234, 178, 95, 0.11)',
    },
  },
  {
    id: 'profile-workspace',
    scenarioId: 'public-profile-desktop',
    title: 'Profile Workspace',
    kind: 'desktop',
    priority: false,
    ambient: {
      primary: 'rgba(113, 111, 227, 0.28)',
      secondary: 'rgba(74, 151, 221, 0.16)',
      accent: 'rgba(214, 111, 139, 0.11)',
    },
  },
  {
    id: 'tracked-links',
    scenarioId: 'artist-spec-tracked-links-desktop',
    title: 'Tracked Links',
    kind: 'desktop',
    priority: false,
    ambient: {
      primary: 'rgba(69, 150, 210, 0.27)',
      secondary: 'rgba(196, 115, 84, 0.14)',
      accent: 'rgba(100, 204, 193, 0.12)',
    },
  },
  {
    id: 'profile-phone',
    scenarioId: 'public-profile-mobile',
    title: 'Artist Profile',
    kind: 'phone',
    priority: false,
    ambient: {
      primary: 'rgba(105, 130, 230, 0.28)',
      secondary: 'rgba(75, 190, 216, 0.14)',
      accent: 'rgba(216, 126, 92, 0.12)',
    },
  },
] as const;

const HOVER_ADVANCE_DELAY_MS = 700;

function getHeroMockupSizes(kind: HeroMockupKind): string {
  if (kind === 'phone') {
    return '(min-width: 1024px) 12rem, 34vw';
  }

  if (kind === 'panel') {
    return '(min-width: 1024px) 23rem, 68vw';
  }

  return '(min-width: 1024px) 44rem, 86vw';
}

function getWrappedIndex(index: number): number {
  return (
    (index + HERO_MOCKUP_SCREENSHOTS.length) % HERO_MOCKUP_SCREENSHOTS.length
  );
}

function getOffset(index: number, activeIndex: number): number {
  let offset = index - activeIndex;
  const midpoint = Math.floor(HERO_MOCKUP_SCREENSHOTS.length / 2);

  if (offset > midpoint) {
    offset -= HERO_MOCKUP_SCREENSHOTS.length;
  }

  if (offset < -midpoint) {
    offset += HERO_MOCKUP_SCREENSHOTS.length;
  }

  return offset;
}

function getSlideBlur(distance: number): string {
  if (distance === 0) return '0px';
  if (distance === 1) return '0.8px';
  return '1.5px';
}

function getSlideStyle(offset: number): CSSProperties {
  const distance = Math.abs(offset);
  const isVisible = distance <= 1;
  const opacity = isVisible && distance === 0 ? 1 : 0;
  const blur = getSlideBlur(distance);

  return {
    '--carousel-offset': offset,
    '--carousel-opacity': opacity,
    '--carousel-scale': distance === 0 ? 1 : 0.92,
    '--carousel-blur': blur,
    '--carousel-z': HERO_MOCKUP_SCREENSHOTS.length - distance,
  } as CSSProperties;
}

export function HomepageHeroMockupCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [hoverDirection, setHoverDirection] =
    useState<CarouselDirection | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const suppressHoverUntilLeaveRef = useRef(false);
  const activeShot = HERO_MOCKUP_SCREENSHOTS[activeIndex];

  const advance = useCallback((direction: CarouselDirection) => {
    setActiveIndex(currentIndex => getWrappedIndex(currentIndex + direction));
  }, []);

  useEffect(() => {
    if (!window.matchMedia) {
      return;
    }

    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => setPrefersReducedMotion(query.matches);

    handleChange();
    query.addEventListener('change', handleChange);

    return () => {
      query.removeEventListener('change', handleChange);
    };
  }, []);

  useEffect(() => {
    if (hoverDirection === null || prefersReducedMotion) {
      return;
    }

    const intervalId = window.setInterval(() => {
      advance(hoverDirection);
    }, HOVER_ADVANCE_DELAY_MS);

    return () => window.clearInterval(intervalId);
  }, [advance, hoverDirection, prefersReducedMotion]);

  const handleHoverStart = (direction: CarouselDirection) => {
    if (prefersReducedMotion || suppressHoverUntilLeaveRef.current) {
      return;
    }

    setHoverDirection(direction);
  };

  const handleCarouselClick = (direction: CarouselDirection) => {
    suppressHoverUntilLeaveRef.current = true;
    setHoverDirection(null);
    advance(direction);
  };

  const stopHoverScroll = () => {
    suppressHoverUntilLeaveRef.current = false;
    setHoverDirection(null);
  };

  const ambientStyle = {
    '--homepage-ambient-primary': activeShot.ambient.primary,
    '--homepage-ambient-secondary': activeShot.ambient.secondary,
    '--homepage-ambient-accent': activeShot.ambient.accent,
  } as CSSProperties;

  return (
    <section
      className='homepage-hero-showcase'
      aria-label='Jovie product screenshots'
      data-testid='homepage-hero-carousel'
      style={ambientStyle}
    >
      <div className='homepage-hero-carousel__viewport'>
        <p className='sr-only' aria-live='polite'>
          Showing {activeShot.title}
        </p>
        <div
          className='homepage-hero-carousel__stage'
          data-active-shot={activeShot.id}
        >
          {HERO_MOCKUP_SCREENSHOTS.map((shot, index) => {
            const offset = getOffset(index, activeIndex);
            const isActive = offset === 0;

            return (
              <figure
                aria-hidden={!isActive}
                className={`homepage-hero-mockup homepage-hero-mockup--${shot.kind}`}
                data-active={isActive ? 'true' : 'false'}
                data-testid={`homepage-hero-shot-${shot.id}`}
                key={shot.id}
                style={getSlideStyle(offset)}
              >
                <ProductScreenshotFrame
                  scenarioId={shot.scenarioId}
                  sizes={getHeroMockupSizes(shot.kind)}
                  priority={shot.priority}
                  device={shot.kind === 'phone' ? 'phone' : 'desktop'}
                  aria-hidden={!isActive}
                  className='homepage-hero-mockup__frame'
                />
              </figure>
            );
          })}
        </div>
        <button
          type='button'
          className='homepage-hero-carousel__side homepage-hero-carousel__side--previous focus-ring-themed'
          aria-label='Go to previous slide'
          onClick={() => handleCarouselClick(-1)}
          onMouseEnter={() => handleHoverStart(-1)}
          onMouseLeave={stopHoverScroll}
        >
          <span className='homepage-hero-carousel__arrow'>
            <ChevronLeft aria-hidden='true' strokeWidth={1.8} />
          </span>
        </button>
        <button
          type='button'
          className='homepage-hero-carousel__side homepage-hero-carousel__side--next focus-ring-themed'
          aria-label='Go to next slide'
          onClick={() => handleCarouselClick(1)}
          onMouseEnter={() => handleHoverStart(1)}
          onMouseLeave={stopHoverScroll}
        >
          <span className='homepage-hero-carousel__arrow'>
            <ChevronRight aria-hidden='true' strokeWidth={1.8} />
          </span>
        </button>
      </div>
    </section>
  );
}
