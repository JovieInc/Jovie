'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { EntityCard } from './EntityCard';
import type { EntityCardModel, EntitySurface } from './types';

interface EntityCarouselProps {
  readonly items: readonly EntityCardModel[];
  readonly surface?: EntitySurface;
  readonly className?: string;
  readonly dataTestId?: string;
  readonly onCardImpression?: (index: number, model: EntityCardModel) => void;
  readonly onCardClick?: (index: number, model: EntityCardModel) => void;
}

/**
 * One horizontal snap track with one stable card geometry. Ordering can make an
 * item prominent, but its dimensions must not change: mixed card sizes create a
 * false hierarchy, crop the trailing cards, and make the rail look vertically
 * scrollable inside the fixed profile shell.
 */
export function EntityCarousel({
  items,
  surface = 'pearl',
  className,
  dataTestId,
  onCardImpression,
  onCardClick,
}: EntityCarouselProps) {
  const itemRefs = useRef<Array<HTMLLIElement | null>>([]);
  const trackedImpressionKeys = useRef<Set<string>>(new Set());

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

  if (items.length === 0) {
    return null;
  }

  return (
    <ul
      className={cn(
        'profile-horizontal-rail flex snap-x snap-mandatory list-none gap-3 overflow-x-auto overflow-y-hidden overscroll-x-contain',
        className
      )}
      data-testid={dataTestId ?? 'entity-carousel'}
    >
      {items.map((model, index) => {
        return (
          <li
            key={`${model.kind}-${model.id}`}
            ref={node => {
              itemRefs.current[index] = node;
            }}
            data-carousel-index={index}
            // items-start keeps the deterministic shape in charge: a stretched
            // cross-axis would override the card's fixed aspect ratio.
            className='flex h-96 w-56 shrink-0 snap-start items-start'
          >
            <EntityCard
              model={model}
              treatment='detailed'
              // Square art plus metadata and a 44px control cannot fit inside
              // the old 4:5 shell. The rail owns one explicit 224x384 footprint
              // so every card stays equal without clipping its useful content.
              surface={surface}
              priority={index === 0}
              className='h-full w-full overflow-hidden'
              onClick={
                onCardClick ? () => onCardClick(index, model) : undefined
              }
            />
          </li>
        );
      })}
    </ul>
  );
}
