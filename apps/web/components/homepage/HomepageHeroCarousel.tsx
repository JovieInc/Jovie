'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ProductScreenshot } from '@/components/features/home/ProductScreenshot';
import { getMarketingExportImage } from '@/lib/screenshots/registry';

type HeroMockupKind = 'desktop' | 'phone' | 'panel';
type CarouselDirection = -1 | 1;

interface HeroMockupShot {
  readonly id: string;
  readonly src: string;
  readonly alt: string;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly kind: HeroMockupKind;
  readonly priority: boolean;
}

const HERO_MOCKUP_SCREENSHOTS: readonly HeroMockupShot[] = [
  {
    id: 'app-shell-releases',
    src: getMarketingExportImage('dashboard-releases-desktop').publicUrl,
    alt: 'Desktop release dashboard with tasks, assets, and launch planning',
    title: 'Release Dashboard',
    width: 2880,
    height: 1800,
    kind: 'desktop',
    priority: true,
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

function getSlideStyle(offset: number): CSSProperties {
  const distance = Math.abs(offset);
  const isVisible = distance <= 2;

  return {
    '--carousel-offset': offset,
    '--carousel-opacity': isVisible
      ? distance === 0
        ? 1
        : distance === 1
          ? 1
          : 0.4
      : 0,
    '--carousel-scale': distance <= 1 ? 1 : 0.96,
    '--carousel-blur':
      distance === 0 ? '0px' : distance === 1 ? '0.1px' : '1px',
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
  const isCarouselEnabled = HERO_MOCKUP_SCREENSHOTS.length > 1;

  const advance = useCallback((direction: CarouselDirection) => {
    if (HERO_MOCKUP_SCREENSHOTS.length <= 1) {
      return;
    }

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
    if (hoverDirection === null || prefersReducedMotion || !isCarouselEnabled) {
      return;
    }

    const intervalId = window.setInterval(() => {
      advance(hoverDirection);
    }, HOVER_ADVANCE_DELAY_MS);

    return () => window.clearInterval(intervalId);
  }, [advance, hoverDirection, prefersReducedMotion, isCarouselEnabled]);

  const handleHoverStart = (direction: CarouselDirection) => {
    if (
      !isCarouselEnabled ||
      prefersReducedMotion ||
      suppressHoverUntilLeaveRef.current
    ) {
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

  return (
    <section
      className='homepage-hero-showcase'
      aria-label='Jovie product screenshots'
      data-testid='homepage-hero-carousel'
    >
      <div className='homepage-hero-carousel__viewport'>
        <p className='sr-only' aria-live='polite'>
          Showing {activeShot.title}
        </p>
        <div
          className='homepage-hero-carousel__stage'
          data-active-shot={activeShot.id}
          data-carousel-enabled={isCarouselEnabled ? 'true' : 'false'}
        >
          {HERO_MOCKUP_SCREENSHOTS.map((shot, index) => {
            const offset = getOffset(index, activeIndex);
            const isActive = offset === 0;
            // Phone shots use a hardcoded 9/19.5 frame aspect (set in CSS).
            // Desktop/panel shots get the real capture aspect so object-fit:
            // cover doesn't crop top/bottom (16:9 frame vs 16:10 capture).
            const shotStyle: CSSProperties =
              shot.kind === 'phone'
                ? getSlideStyle(offset)
                : ({
                    ...getSlideStyle(offset),
                    '--homepage-shot-aspect-ratio': `${shot.width} / ${shot.height}`,
                  } as CSSProperties);

            return (
              <div
                aria-hidden={!isActive}
                className={`homepage-hero-mockup homepage-hero-mockup--${shot.kind}`}
                data-active={isActive ? 'true' : 'false'}
                data-testid={`homepage-hero-shot-${shot.id}`}
                key={shot.id}
                style={shotStyle}
              >
                <ProductScreenshot
                  src={shot.src}
                  alt={isActive ? shot.alt : ''}
                  width={shot.width}
                  height={shot.height}
                  title={shot.title}
                  priority={shot.priority}
                  quality={85}
                  sizes={getHeroMockupSizes(shot.kind)}
                  chrome='minimal'
                  skipCheck
                  testId={`homepage-hero-frame-${shot.id}`}
                  className='homepage-hero-mockup__frame'
                />
              </div>
            );
          })}
        </div>
        {isCarouselEnabled ? (
          <>
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
          </>
        ) : null}
      </div>
    </section>
  );
}
