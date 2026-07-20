'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { cn } from '@/lib/utils';
import { EntityCard } from './EntityCard';
import type { EntityCardModel, EntitySurface } from './types';

interface EntityCarouselProps {
  readonly items: readonly EntityCardModel[];
  readonly surface?: EntitySurface;
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
 * Geometry lives in `.profile-entity-card` (design-system.css): 3:4 aspect
 * ratio, height locked to the track (h-full), width derived from height,
 * capped so no card exceeds ~78vw. The track fills the remaining viewport
 * height (h-full) so primary content never needs vertical scrolling.
 */
export function EntityCarousel({
  items,
  surface = 'pearl',
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
  const prefersReducedMotion = useReducedMotion();

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
          if (!entry.isIntersecting) {
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
      { threshold: 0.5 }
    );

    for (const node of itemRefs.current) {
      if (node) {
        observer.observe(node);
      }
    }

    return () => observer.disconnect();
  }, [items, onCardImpression]);

  // Scroll-driven edge treatment: cards not fully inside the track dim and
  // scale down slightly (transform/opacity only). Skipped entirely when the
  // user prefers reduced motion — cards stay at full scale/opacity.
  useEffect(() => {
    if (prefersReducedMotion || typeof IntersectionObserver === 'undefined') {
      return;
    }
    const track = trackRef.current;
    if (!track) {
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          const node = entry.target as HTMLElement;
          node.dataset.edge = entry.isIntersecting ? 'false' : 'true';
        }
      },
      { root: track, threshold: 0.95 }
    );

    for (const node of Array.from(track.children)) {
      observer.observe(node);
    }

    return () => observer.disconnect();
  }, [prefersReducedMotion, items, leading, trailing]);

  if (items.length === 0 && !leading && !trailing) {
    return null;
  }

  return (
    <ul
      ref={trackRef}
      className={cn(
        'profile-horizontal-rail flex h-full snap-x snap-mandatory list-none items-stretch gap-3 overflow-x-auto overflow-y-hidden overscroll-x-contain',
        className
      )}
      data-testid={dataTestId ?? 'entity-carousel'}
    >
      {leading ? (
        <li data-carousel-slot='leading' className={CARD_ITEM_CLASSNAME}>
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
            className={CARD_ITEM_CLASSNAME}
          >
            <EntityCard
              model={model}
              treatment='detailed'
              // The hero keeps image priority; carousel art stays lazy so the
              // LCP image never competes with the cover photo. artFit='fill'
              // lets the art zone flex inside the height-locked card so the
              // CTA footer never clips.
              surface={surface}
              artFit='fill'
              className='h-full w-full overflow-hidden'
              onClick={
                onCardClick ? () => onCardClick(index, model) : undefined
              }
            />
          </li>
        );
      })}
      {trailing ? (
        <li data-carousel-slot='trailing' className={CARD_ITEM_CLASSNAME}>
          {trailing}
        </li>
      ) : null}
    </ul>
  );
}
