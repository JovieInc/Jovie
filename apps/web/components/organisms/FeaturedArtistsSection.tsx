'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { memo, useRef } from 'react';
import { SectionHeading } from '@/components/atoms/SectionHeading';
import { ArtistCard } from '@/components/molecules/ArtistCard';

export type FeaturedCreator = {
  id: string;
  handle: string;
  name: string;
  src: string;
  alt?: string;
};

export interface FeaturedCreatorsSectionProps {
  readonly creators: FeaturedCreator[];
  readonly title?: string;
  readonly className?: string;
  readonly showTitle?: boolean;
  readonly showNames?: boolean;
}

const areCreatorsEqual = (
  previous: FeaturedCreatorsSectionProps,
  next: FeaturedCreatorsSectionProps
) => {
  if (previous.title !== next.title) return false;
  if (previous.className !== next.className) return false;
  if (previous.showTitle !== next.showTitle) return false;
  if (previous.showNames !== next.showNames) return false;

  const prevCreators = previous.creators;
  const nextCreators = next.creators;

  if (prevCreators === nextCreators) return true;
  if (prevCreators.length !== nextCreators.length) return false;

  for (let index = 0; index < prevCreators.length; index += 1) {
    const prev = prevCreators[index];
    const current = nextCreators[index];
    if (
      prev.id !== current.id ||
      prev.handle !== current.handle ||
      prev.name !== current.name ||
      prev.src !== current.src ||
      prev.alt !== current.alt
    ) {
      return false;
    }
  }

  return true;
};

interface VirtualizedCreatorsRowProps {
  readonly creators: FeaturedCreator[];
  readonly size: 'sm' | 'md';
  readonly gap: number;
  readonly paddingStart: number;
  readonly paddingEnd: number;
  readonly estimatedWidth: number;
  readonly rowHeight: number;
  readonly containerClassName: string;
  readonly itemClassName: string;
  readonly ariaLabel: string;
  readonly showNames: boolean;
}

function VirtualizedCreatorsRow({
  creators,
  size,
  gap,
  paddingStart,
  paddingEnd,
  estimatedWidth,
  rowHeight,
  containerClassName,
  itemClassName,
  ariaLabel,
  showNames,
}: VirtualizedCreatorsRowProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const virtualizer = useVirtualizer({
    count: creators.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimatedWidth,
    horizontal: true,
    overscan: 4,
    paddingStart,
    paddingEnd,
  });

  return (
    <div ref={scrollRef} className={containerClassName}>
      <ul
        className='relative'
        aria-label={ariaLabel}
        style={{
          width: `${virtualizer.getTotalSize()}px`,
          height: `${rowHeight}px`,
        }}
      >
        {virtualizer.getVirtualItems().map(virtualItem => {
          const creator = creators[virtualItem.index];
          if (!creator) return null;

          return (
            <li
              key={creator.id}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              className={itemClassName}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                transform: `translateX(${virtualItem.start}px)`,
                paddingRight: `${gap}px`,
              }}
            >
              <ArtistCard
                handle={creator.handle}
                name={creator.name}
                src={creator.src}
                alt={creator.alt}
                size={size}
                showName={showNames}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export const FeaturedCreatorsSection = memo(function FeaturedCreatorsSection({
  creators,
  title = 'Featured Creators',
  className = '',
  showTitle = true,
  showNames = true,
}: FeaturedCreatorsSectionProps) {
  return (
    <section
      aria-label='Featured creators'
      className={`relative py-6 md:py-10 max-w-full overflow-hidden ${className}`}
      data-testid='featured-creators'
    >
      <div className='container mx-auto px-4'>
        <SectionHeading
          level={2}
          className={`mb-8 ${showTitle ? '' : 'sr-only'}`}
        >
          {title}
        </SectionHeading>

        {/* Desktop: horizontal scroll with fade */}
        <div className='hidden md:block relative'>
          {/* Left fade gradient - more subtle */}
          <div className='absolute left-0 top-0 bottom-4 w-6 bg-gradient-to-r from-white dark:from-[#0D0E12] to-transparent z-10 pointer-events-none' />

          {/* Right fade gradient - more subtle */}
          <div className='absolute right-0 top-0 bottom-4 w-12 bg-gradient-to-l from-white dark:from-[#0D0E12] to-transparent z-10 pointer-events-none' />

          <VirtualizedCreatorsRow
            creators={creators}
            size='md'
            gap={32}
            paddingStart={16}
            paddingEnd={32}
            estimatedWidth={176}
            rowHeight={196}
            containerClassName='overflow-x-auto scroll-smooth pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
            itemClassName='shrink-0'
            ariaLabel='Featured creators'
            showNames={showNames}
          />
        </div>

        {/* Mobile: swipe with fade */}
        <div className='md:hidden relative'>
          {/* Left fade gradient - mobile, more subtle */}
          <div className='absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-white dark:from-[#0D0E12] to-transparent z-10 pointer-events-none' />

          {/* Right fade gradient - mobile, more subtle */}
          <div className='absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white dark:from-[#0D0E12] to-transparent z-10 pointer-events-none' />

          <VirtualizedCreatorsRow
            creators={creators}
            size='sm'
            gap={16}
            paddingStart={8}
            paddingEnd={32}
            estimatedWidth={120}
            rowHeight={140}
            containerClassName='overflow-x-auto scroll-smooth px-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
            itemClassName='shrink-0'
            ariaLabel='Featured creators'
            showNames={showNames}
          />
        </div>
      </div>
    </section>
  );
}, areCreatorsEqual);

// Export both names for compatibility during transition
export const FeaturedArtistsSection = FeaturedCreatorsSection;
