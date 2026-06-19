'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useSwipeMode } from '@/hooks/useSwipeMode';
import { cn } from '@/lib/utils';
import { ProfileMediaCard } from './ProfileMediaCard';
import type { PublicRelease } from './releases/types';

const PEEK_PX = 24; // px of next card visible on the right
const GAP_PX = 12;

function formatReleaseType(type: string): string {
  if (type === 'ep') return 'EP';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

interface ReleaseCatalogCarouselProps {
  readonly primaryCard: ReactNode;
  readonly catalogReleases: readonly PublicRelease[];
  readonly artistHandle: string;
}

export function ReleaseCatalogCarousel({
  primaryCard,
  catalogReleases,
  artistHandle,
}: ReleaseCatalogCarouselProps) {
  const count = 1 + catalogReleases.length;
  const { activeIndex, containerRef, dragOffset, isDragging, handlers } =
    useSwipeMode({ count });
  const [slideW, setSlideW] = useState<number | null>(null);

  useEffect(() => {
    if (catalogReleases.length === 0) return;
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setSlideW(el.offsetWidth - PEEK_PX);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [catalogReleases.length, containerRef]);

  // No catalog: render primary card without any carousel wrapper
  if (catalogReleases.length === 0) {
    return <>{primaryCard}</>;
  }

  const trackX =
    slideW !== null ? -activeIndex * (slideW + GAP_PX) + dragOffset : 0;
  const slideStyle = {
    width: slideW !== null ? `${slideW}px` : `calc(100% - ${PEEK_PX}px)`,
  };

  return (
    <div
      ref={containerRef}
      className='overflow-hidden'
      data-testid='release-catalog-carousel'
      {...handlers}
    >
      <div
        className={cn(
          'flex',
          isDragging ? '' : 'transition-transform duration-subtle ease-out'
        )}
        style={{ gap: `${GAP_PX}px`, transform: `translateX(${trackX}px)` }}
      >
        <div className='shrink-0' style={slideStyle}>
          {primaryCard}
        </div>
        {catalogReleases.map(release => {
          const releaseYear = release.releaseDate
            ? new Date(release.releaseDate).getUTCFullYear()
            : null;
          const subtitle =
            formatReleaseType(release.releaseType) +
            (releaseYear ? ' · ' + releaseYear : '');
          return (
            <div key={release.id} className='shrink-0' style={slideStyle}>
              <ProfileMediaCard
                eyebrow={formatReleaseType(release.releaseType)}
                title={release.title}
                subtitle={subtitle}
                imageUrl={release.artworkUrl}
                imageAlt={`${release.title} artwork`}
                fallbackVariant='release'
                accent='purple'
                ratio='landscape'
                action={{
                  label: 'Listen',
                  href: `/${artistHandle}/${release.slug}`,
                  icon: 'Play',
                }}
                dataTestId={`catalog-release-card-${release.id}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
