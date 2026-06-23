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
 * One horizontal snap track. The featured (first) item renders `big`; the rest
 * render `compact`. This is the single card section for a public-profile home —
 * no stacked sections.
 *
 * ponytail: treatment is SSR-stable (position-only), not a client breakpoint —
 * a JS media-query switch would flip content on hydration and shift layout,
 * which the layout-shift rule bans. Revealing the `detailed` treatment on wide
 * viewports is a CSS container-query enhancement → JOV follow-up, not a hook.
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
        'flex snap-x snap-mandatory list-none gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className
      )}
      data-testid={dataTestId ?? 'entity-carousel'}
    >
      {items.map((model, index) => {
        const isFeatured = index === 0;
        return (
          <li
            key={`${model.kind}-${model.id}`}
            ref={node => {
              itemRefs.current[index] = node;
            }}
            data-carousel-index={index}
            className={cn(
              'flex shrink-0 snap-start',
              isFeatured ? 'w-[260px]' : 'w-[180px]'
            )}
          >
            <EntityCard
              model={model}
              treatment={isFeatured ? 'big' : 'compact'}
              surface={surface}
              priority={isFeatured}
              className='w-full'
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
