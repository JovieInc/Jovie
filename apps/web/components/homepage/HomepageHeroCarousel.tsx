'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  HOMEPAGE_HERO_CAROUSEL_SLIDES,
  type HomepageHeroCarouselSlide,
} from '@/data/homepageLaunchCopy';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { cn } from '@/lib/utils';
import { trackHomepageEvent } from './homepage-analytics';

type CarouselDirection = -1 | 1;

function getWrappedIndex(index: number): number {
  return (
    (index + HOMEPAGE_HERO_CAROUSEL_SLIDES.length) %
    HOMEPAGE_HERO_CAROUSEL_SLIDES.length
  );
}

function getOffset(index: number, activeIndex: number): number {
  let offset = index - activeIndex;
  const midpoint = Math.floor(HOMEPAGE_HERO_CAROUSEL_SLIDES.length / 2);

  if (offset > midpoint) {
    offset -= HOMEPAGE_HERO_CAROUSEL_SLIDES.length;
  }

  if (offset < -midpoint) {
    offset += HOMEPAGE_HERO_CAROUSEL_SLIDES.length;
  }

  return offset;
}

function getSlideStyle(offset: number): CSSProperties {
  const distance = Math.abs(offset);
  const isVisible = distance <= 1;
  const isActive = distance === 0;

  return {
    '--carousel-offset': offset,
    '--carousel-opacity': isVisible ? getSlideOpacity(isActive) : 0,
    '--carousel-scale': isActive ? 1 : 0.94,
    '--carousel-z': HOMEPAGE_HERO_CAROUSEL_SLIDES.length - distance,
  } as CSSProperties;
}

function getSlideOpacity(isActive: boolean) {
  return isActive ? 1 : 0.16;
}

function ProductProofImage({
  className,
  eager,
  scenarioId,
  sizes,
}: Readonly<{
  className?: string;
  eager?: boolean;
  scenarioId: string;
  sizes: string;
}>) {
  const image = getMarketingExportImage(scenarioId);

  return (
    <div className={cn('homepage-product-proof-frame', className)}>
      <Image
        src={image.publicUrl}
        alt={image.alt}
        width={image.width}
        height={image.height}
        loading={eager ? 'eager' : 'lazy'}
        priority={eager}
        sizes={sizes}
        quality={85}
        className='block h-full w-full object-contain'
      />
    </div>
  );
}

function HeroCarouselSlide({
  index,
  offset,
  slide,
}: Readonly<{
  index: number;
  offset: number;
  slide: HomepageHeroCarouselSlide;
}>) {
  const active = offset === 0;

  return (
    <figure
      aria-hidden={!active}
      className='homepage-hero-slide'
      data-active={active ? 'true' : 'false'}
      data-testid={`homepage-hero-shot-${slide.id}`}
      key={slide.id}
      style={getSlideStyle(offset)}
    >
      <figcaption className='sr-only'>
        {slide.label}: {slide.headline} {slide.description}
      </figcaption>
      <div className='homepage-hero-slide__media'>
        <ProductProofImage
          scenarioId={slide.desktopScreenshotKey}
          sizes='(min-width: 1024px) 58rem, (min-width: 768px) 76vw, 88vw'
          eager={active}
          className='homepage-product-proof-frame--desktop'
        />
        <ProductProofImage
          scenarioId={slide.mobileScreenshotKey}
          sizes='(min-width: 1024px) 12rem, (min-width: 768px) 18vw, 30vw'
          eager={active}
          className='homepage-product-proof-frame--phone'
        />
      </div>
    </figure>
  );
}

export function HomepageHeroMockupCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const activeSlide = HOMEPAGE_HERO_CAROUSEL_SLIDES[activeIndex];

  const selectIndex = useCallback((nextIndex: number, source: string) => {
    const wrappedIndex = getWrappedIndex(nextIndex);
    setActiveIndex(wrappedIndex);
    const nextSlide = HOMEPAGE_HERO_CAROUSEL_SLIDES[wrappedIndex];
    trackHomepageEvent('homepage_carousel_selected', {
      slideId: nextSlide.id,
      slideLabel: nextSlide.label,
      source,
    });
  }, []);

  const advance = useCallback(
    (direction: CarouselDirection) => {
      selectIndex(
        activeIndex + direction,
        direction === 1 ? 'next' : 'previous'
      );
    },
    [activeIndex, selectIndex]
  );

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

  return (
    <section
      className='homepage-hero-showcase'
      aria-label='Jovie product screenshots'
      data-testid='homepage-hero-carousel'
      data-reduced-motion={prefersReducedMotion ? 'true' : undefined}
    >
      <div className='homepage-hero-carousel__viewport'>
        <p className='sr-only' aria-live='polite'>
          Showing {activeSlide.label}: {activeSlide.headline}
        </p>
        <div
          className='homepage-hero-carousel__stage'
          data-active-shot={activeSlide.id}
        >
          {HOMEPAGE_HERO_CAROUSEL_SLIDES.map((slide, index) => {
            const offset = getOffset(index, activeIndex);

            return (
              <HeroCarouselSlide
                index={index}
                key={slide.id}
                offset={offset}
                slide={slide}
              />
            );
          })}
        </div>
        <div className='homepage-hero-carousel__controls'>
          <button
            type='button'
            className='homepage-hero-carousel__button focus-ring-themed'
            aria-label='Go to previous slide'
            onClick={() => advance(-1)}
          >
            <ChevronLeft aria-hidden='true' strokeWidth={1.8} />
          </button>
          <div
            className='homepage-hero-carousel__dots'
            aria-label='Product screenshot slides'
            role='tablist'
          >
            {HOMEPAGE_HERO_CAROUSEL_SLIDES.map((slide, index) => (
              <button
                key={slide.id}
                type='button'
                aria-label={`Show ${slide.label}`}
                aria-selected={index === activeIndex}
                className='homepage-hero-carousel__dot focus-ring-themed'
                data-active={index === activeIndex ? 'true' : 'false'}
                onClick={() => selectIndex(index, 'dot')}
                role='tab'
              />
            ))}
          </div>
          <button
            type='button'
            className='homepage-hero-carousel__button focus-ring-themed'
            aria-label='Go to next slide'
            onClick={() => advance(1)}
          >
            <ChevronRight aria-hidden='true' strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </section>
  );
}
