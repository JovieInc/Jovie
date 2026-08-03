'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { cn } from '@/lib/utils';
import { EntityCard } from './EntityCard';
import type { EntityCardModel, EntitySurface } from './types';

export type EntityCarouselLayout = 'portrait' | 'profile-landscape';

interface EntityCarouselProps {
  readonly items: readonly EntityCardModel[];
  readonly surface?: EntitySurface;
  readonly layout?: EntityCarouselLayout;
  readonly className?: string;
  readonly dataTestId?: string;
  /**
   * Custom cards rendered in the same fixed card geometry as entity items —
   * `leading` becomes the featured first card (e.g. the PAC card), `trailing`
   * the last card (e.g. the alerts card). Neither participates in entity
   * impression/click analytics.
   */
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  readonly onCardImpression?: (index: number, model: EntityCardModel) => void;
  readonly onCardClick?: (index: number, model: EntityCardModel) => void;
}

const CARD_ITEM_CLASSNAME =
  'profile-entity-card flex shrink-0 snap-start snap-always';

/**
 * One horizontal snap track with one stable card geometry. Ordering can make an
 * item prominent, but its dimensions must not change: mixed card sizes create a
 * false hierarchy, crop the trailing cards, and make the rail look vertically
 * scrollable inside the fixed profile shell.
 *
 * Geometry lives in `.profile-entity-card` (design-system.css). Portrait is
 * the default 3:4, height-locked treatment. `profile-landscape` is the compact
 * public-profile exception: a full-content-width 9:4 card with one mandatory
 * snap per viewport and no neighboring-card preview at rest.
 */
export function EntityCarousel({
  items,
  surface = 'pearl',
  layout = 'portrait',
  className,
  dataTestId,
  leading,
  trailing,
  onCardImpression,
  onCardClick,
}: EntityCarouselProps) {
  const trackRef = useRef<HTMLUListElement | null>(null);
  const itemRefs = useRef<Array<HTMLLIElement | null>>([]);
  const trackedImpressionKeys = useRef<Set<string>>(new Set());
  const scrollFrameRef = useRef<number | null>(null);
  const snapStepRef = useRef(0);
  const prefersReducedMotion = useReducedMotion();
  const [currentIndex, setCurrentIndex] = useState(0);
  const slotCount = items.length + (leading ? 1 : 0) + (trailing ? 1 : 0);
  const showsDesktopControls = layout === 'profile-landscape' && slotCount > 1;

  useEffect(() => {
    setCurrentIndex(index => Math.min(index, Math.max(slotCount - 1, 0)));
  }, [slotCount]);

  const scrollToIndex = useCallback(
    (nextIndex: number) => {
      const track = trackRef.current;
      if (!track) return;
      const boundedIndex = Math.max(0, Math.min(nextIndex, slotCount - 1));
      const target = track.children.item(boundedIndex) as HTMLElement | null;
      if (!target) return;
      const firstTarget = track.children.item(0) as HTMLElement | null;
      track.scrollTo({
        left: target.offsetLeft - (firstTarget?.offsetLeft ?? 0),
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
      setCurrentIndex(boundedIndex);
    },
    [prefersReducedMotion, slotCount]
  );

  const handleScroll = useCallback(() => {
    if (scrollFrameRef.current !== null) return;

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const track = trackRef.current;
      const snapStep = snapStepRef.current;
      if (!track || snapStep <= 0) return;

      const nearestIndex = Math.max(
        0,
        Math.min(Math.round(track.scrollLeft / snapStep), slotCount - 1)
      );
      setCurrentIndex(index => (index === nearestIndex ? index : nearestIndex));
    });
  }, [slotCount]);

  useEffect(() => {
    const track = trackRef.current;
    if (!showsDesktopControls || !track) {
      snapStepRef.current = 0;
      return;
    }

    const refreshSnapStep = () => {
      const scrollRange = track.scrollWidth - track.clientWidth;
      snapStepRef.current =
        slotCount > 1 && scrollRange > 0 ? scrollRange / (slotCount - 1) : 0;
    };

    refreshSnapStep();
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(refreshSnapStep);

    if (resizeObserver) {
      resizeObserver.observe(track);
    } else {
      window.addEventListener('resize', refreshSnapStep);
    }

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', refreshSnapStep);
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [showsDesktopControls, slotCount]);

  useEffect(() => {
    if (!onCardImpression || items.length === 0) {
      return;
    }

    if (typeof IntersectionObserver === 'undefined') {
      for (const [index, model] of items.entries()) {
        const key = `${model.kind}-${model.id}-${index}`;
        if (trackedImpressionKeys.current.has(key)) {
          continue;
        }
        trackedImpressionKeys.current.add(key);
        onCardImpression(index, model);
      }
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.5) {
            continue;
          }

          const index = Number(
            entry.target.getAttribute('data-carousel-index')
          );
          const model = items[index];
          if (!model) {
            continue;
          }

          const key = `${model.kind}-${model.id}-${index}`;
          if (trackedImpressionKeys.current.has(key)) {
            continue;
          }

          trackedImpressionKeys.current.add(key);
          onCardImpression(index, model);
        }
      },
      { root: trackRef.current, threshold: 0.5 }
    );

    for (const node of itemRefs.current) {
      if (node) {
        observer.observe(node);
      }
    }

    return () => observer.disconnect();
  }, [items, onCardImpression]);

  // Scroll-driven edge treatment: cards not fully inside the track dim
  // slightly. Skipped entirely when the user prefers reduced motion — cards
  // stay at full opacity. Geometry never changes while the rail is moving.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) {
      return;
    }

    const clearEdgeTreatment = () => {
      for (const node of Array.from(track.children)) {
        (node as HTMLElement).dataset.edge = 'false';
      }
    };

    if (prefersReducedMotion || typeof IntersectionObserver === 'undefined') {
      clearEdgeTreatment();
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          const node = entry.target as HTMLElement;
          node.dataset.edge =
            entry.isIntersecting && entry.intersectionRatio >= 0.95
              ? 'false'
              : 'true';
        }
      },
      { root: track, threshold: 0.95 }
    );

    for (const node of Array.from(track.children)) {
      observer.observe(node);
    }

    return () => {
      observer.disconnect();
      clearEdgeTreatment();
    };
  }, [prefersReducedMotion, items, leading, trailing]);

  if (items.length === 0 && !leading && !trailing) {
    return null;
  }

  // profile-landscape keeps one page-pad gap between full-content-width cards.
  // The rail itself is page-pad inset, so that gap lands the neighboring card
  // exactly outside the viewport at rest. Portrait keeps a smaller gap for its
  // intentional card preview.
  const isProfileLandscape = layout === 'profile-landscape';
  const cardItemClassName = cn(
    CARD_ITEM_CLASSNAME,
    isProfileLandscape && 'w-full'
  );

  return (
    <div
      className={cn(
        'group/carousel relative min-h-0',
        isProfileLandscape ? 'h-fit w-full' : 'h-full'
      )}
    >
      <ul
        ref={trackRef}
        className={cn(
          'profile-horizontal-rail flex h-full snap-x snap-mandatory list-none items-stretch overflow-x-auto overflow-y-hidden overscroll-x-contain',
          isProfileLandscape ? 'gap-(--page-pad) md:gap-4' : 'gap-3',
          className
        )}
        data-testid={dataTestId ?? 'entity-carousel'}
        data-layout={layout}
        onScroll={showsDesktopControls ? handleScroll : undefined}
      >
        {leading ? (
          <li
            data-carousel-slot='leading'
            data-layout={layout}
            className={cardItemClassName}
          >
            {leading}
          </li>
        ) : null}
        {items.map((model, index) => {
          return (
            <li
              key={`${model.kind}-${model.id}`}
              ref={node => {
                itemRefs.current[index] = node;
              }}
              data-carousel-index={index}
              data-layout={layout}
              className={cardItemClassName}
            >
              <EntityCard
                model={model}
                treatment='detailed'
                // The hero keeps image priority; carousel art stays lazy so the
                // LCP image never competes with the cover photo.
                surface={surface}
                anatomy={
                  layout === 'profile-landscape'
                    ? 'profile-landscape'
                    : 'unified'
                }
                className='h-full w-full overflow-hidden'
                onClick={
                  onCardClick ? () => onCardClick(index, model) : undefined
                }
              />
            </li>
          );
        })}
        {trailing ? (
          <li
            data-carousel-slot='trailing'
            data-layout={layout}
            className={cardItemClassName}
          >
            {trailing}
          </li>
        ) : null}
      </ul>

      {showsDesktopControls ? (
        <>
          <button
            type='button'
            aria-label='Previous Item'
            disabled={currentIndex === 0}
            onClick={() => scrollToIndex(currentIndex - 1)}
            className='absolute left-1 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-(--profile-pearl-border) bg-(--profile-pearl-bg) text-secondary-token opacity-0 shadow-(--profile-pearl-shadow) backdrop-blur-xl transition-opacity duration-subtle [@media(min-width:768px)_and_(hover:hover)_and_(pointer:fine)]:inline-flex hover:text-primary-token focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:pointer-events-none disabled:invisible group-focus-within/carousel:opacity-100 group-hover/carousel:opacity-100'
          >
            <ChevronLeft className='h-4 w-4' aria-hidden='true' />
          </button>
          <button
            type='button'
            aria-label='Next Item'
            disabled={currentIndex === slotCount - 1}
            onClick={() => scrollToIndex(currentIndex + 1)}
            className='absolute right-1 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-(--profile-pearl-border) bg-(--profile-pearl-bg) text-secondary-token opacity-0 shadow-(--profile-pearl-shadow) backdrop-blur-xl transition-opacity duration-subtle [@media(min-width:768px)_and_(hover:hover)_and_(pointer:fine)]:inline-flex hover:text-primary-token focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:pointer-events-none disabled:invisible group-focus-within/carousel:opacity-100 group-hover/carousel:opacity-100'
          >
            <ChevronRight className='h-4 w-4' aria-hidden='true' />
          </button>
          <span className='sr-only' aria-live='polite'>
            Item {currentIndex + 1} of {slotCount}
          </span>
        </>
      ) : null}
    </div>
  );
}
