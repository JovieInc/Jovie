'use client';

import { useEffect, useState } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import type { ScreenshotInfo } from '@/lib/admin/types';
import { CANONICAL_SURFACES } from '@/lib/canonical-surfaces';
import { ScreenshotCard } from './ScreenshotCard';
import { ScreenshotFilterBar } from './ScreenshotFilterBar';
import type {
  ConsumerFilter,
  GroupFilter,
  SurfaceFilter,
} from './ScreenshotGallery.helpers';
import { ScreenshotLightbox } from './ScreenshotLightbox';

interface ScreenshotGalleryProps {
  readonly screenshots: readonly ScreenshotInfo[];
}

export function ScreenshotGallery({ screenshots }: ScreenshotGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [surfaceFilter, setSurfaceFilter] = useState<SurfaceFilter>('all');
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('all');
  const [consumerFilter, setConsumerFilter] = useState<ConsumerFilter>('all');
  const isOpen = selectedIndex !== null;
  const filteredScreenshots = screenshots.filter(screenshot => {
    let surfaceMatch: boolean;
    if (surfaceFilter === 'all') {
      surfaceMatch = true;
    } else if (surfaceFilter === 'other') {
      surfaceMatch = screenshot.canonicalSurfaceId === undefined;
    } else {
      surfaceMatch = screenshot.canonicalSurfaceId === surfaceFilter;
    }
    const groupMatch =
      groupFilter === 'all' || screenshot.group === groupFilter;
    const consumerMatch =
      consumerFilter === 'all' || screenshot.consumers.includes(consumerFilter);
    return surfaceMatch && groupMatch && consumerMatch;
  });
  const selected =
    selectedIndex === null ? null : filteredScreenshots[selectedIndex];
  const filteredScreenshotsCount = filteredScreenshots.length;
  const totalCanonicalCaptures = screenshots.filter(
    screenshot => screenshot.canonicalSurfaceId !== undefined
  ).length;
  const totalOtherCaptures = screenshots.length - totalCanonicalCaptures;

  function handleClose() {
    setSelectedIndex(null);
  }

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setSelectedIndex(prev => (prev !== null && prev > 0 ? prev - 1 : prev));
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setSelectedIndex(prev =>
          prev !== null && prev < filteredScreenshotsCount - 1 ? prev + 1 : prev
        );
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [filteredScreenshotsCount, isOpen]);

  useEffect(() => {
    setSelectedIndex(null);
  }, [surfaceFilter, groupFilter, consumerFilter]);

  const indexMap = new Map(filteredScreenshots.map((s, i) => [s.id, i]));
  const canonicalSections = CANONICAL_SURFACES.map(surface => ({
    surface,
    items: filteredScreenshots.filter(
      screenshot => screenshot.canonicalSurfaceId === surface.id
    ),
  })).filter(section => section.items.length > 0);

  const otherGroups = new Map<string, ScreenshotInfo[]>();
  for (const screenshot of filteredScreenshots.filter(
    ss => ss.canonicalSurfaceId === undefined
  )) {
    const group = otherGroups.get(screenshot.groupLabel) ?? [];
    group.push(screenshot);
    otherGroups.set(screenshot.groupLabel, group);
  }

  function renderScreenshotCard(screenshot: ScreenshotInfo) {
    const globalIndex = indexMap.get(screenshot.id) ?? 0;
    return (
      <ScreenshotCard
        key={screenshot.id}
        screenshot={screenshot}
        onOpen={() => setSelectedIndex(globalIndex)}
      />
    );
  }

  return (
    <>
      <div className='space-y-4' data-testid='admin-screenshots-content'>
        <ScreenshotFilterBar
          shown={filteredScreenshots.length}
          total={screenshots.length}
          canonical={totalCanonicalCaptures}
          other={totalOtherCaptures}
          surfaceFilter={surfaceFilter}
          groupFilter={groupFilter}
          consumerFilter={consumerFilter}
          onSurfaceChange={setSurfaceFilter}
          onGroupChange={setGroupFilter}
          onConsumerChange={setConsumerFilter}
        />

        {canonicalSections.length > 0 ? (
          <ContentSurfaceCard as='section' className='overflow-hidden'>
            <div className='border-b border-subtle px-4 py-3'>
              <h2 className='text-app font-semibold tracking-tight text-primary-token'>
                Canonical Surfaces
              </h2>
              <p className='mt-1 text-xs text-secondary-token'>
                Review the four repo-owned design-system surfaces directly.
              </p>
            </div>
            <div className='space-y-4 p-4'>
              {canonicalSections.map(({ surface, items }) => (
                <section key={surface.id} className='space-y-3'>
                  <div>
                    <div className='flex items-start justify-between gap-3'>
                      <div className='min-w-0'>
                        <h3 className='text-app font-semibold tracking-tight text-primary-token'>
                          {surface.label}
                        </h3>
                        <p className='mt-1 text-xs text-secondary-token'>
                          {surface.description}
                        </p>
                        <div className='mt-2 flex flex-wrap items-center gap-2 text-2xs text-secondary-token'>
                          <span className='rounded-full bg-surface-1 px-2 py-0.5'>
                            Review Route: {surface.reviewRoute}
                          </span>
                          <span className='rounded-full bg-surface-1 px-2 py-0.5'>
                            {items.length} Capture
                            {items.length === 1 ? '' : 's'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
                    {items.map(renderScreenshotCard)}
                  </div>
                </section>
              ))}
            </div>
          </ContentSurfaceCard>
        ) : null}

        {otherGroups.size > 0 ? (
          <ContentSurfaceCard as='section' className='overflow-hidden'>
            <div className='border-b border-subtle px-4 py-3'>
              <h2 className='text-app font-semibold tracking-tight text-primary-token'>
                Other Captures
              </h2>
              <p className='mt-1 text-xs text-secondary-token'>
                Supporting screenshot coverage outside the four canonical review
                surfaces.
              </p>
            </div>
            <div className='space-y-4 p-4'>
              {[...otherGroups.entries()].map(([sourceLabel, items]) => (
                <section key={sourceLabel} className='space-y-3'>
                  <div className='flex items-center justify-between gap-3'>
                    <h3 className='truncate text-app font-semibold tracking-tight text-primary-token'>
                      {sourceLabel}
                    </h3>
                    <span className='shrink-0 text-xs text-secondary-token'>
                      {items.length}
                    </span>
                  </div>
                  <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
                    {items.map(renderScreenshotCard)}
                  </div>
                </section>
              ))}
            </div>
          </ContentSurfaceCard>
        ) : null}

        {filteredScreenshots.length === 0 ? (
          <ContentSurfaceCard className='p-6'>
            <p className='text-app font-semibold text-primary-token'>
              No screenshots match the current filters.
            </p>
            <p className='mt-1 text-xs text-secondary-token'>
              Clear one or more filters to see canonical surfaces and supporting
              captures again.
            </p>
          </ContentSurfaceCard>
        ) : null}
      </div>

      <ScreenshotLightbox
        open={isOpen}
        selected={selected}
        index={selectedIndex}
        count={filteredScreenshotsCount}
        onClose={handleClose}
        onPrevious={() =>
          setSelectedIndex(prev =>
            prev !== null && prev > 0 ? prev - 1 : prev
          )
        }
        onNext={() =>
          setSelectedIndex(prev =>
            prev !== null && prev < filteredScreenshotsCount - 1
              ? prev + 1
              : prev
          )
        }
      />
    </>
  );
}
