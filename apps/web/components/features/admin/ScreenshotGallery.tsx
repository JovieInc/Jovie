'use client';

import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { DrawerButton } from '@/components/molecules/drawer';
import { Dialog, DialogBody, DialogTitle } from '@/components/organisms/Dialog';
import type { ScreenshotInfo } from '@/lib/admin/types';
import {
  CANONICAL_SURFACES,
  type CanonicalSurfaceId,
} from '@/lib/canonical-surfaces';
import { GROUP_LABELS } from '@/lib/screenshots/registry';
import type {
  ScreenshotConsumer,
  ScreenshotGroup,
} from '@/lib/screenshots/types';

interface ScreenshotGalleryProps {
  readonly screenshots: readonly ScreenshotInfo[];
}

type SurfaceFilter = 'all' | 'other' | CanonicalSurfaceId;

const SURFACE_FILTERS: ReadonlyArray<{
  readonly id: SurfaceFilter;
  readonly label: string;
}> = [
  { id: 'all', label: 'All Captures' },
  ...CANONICAL_SURFACES.map(surface => ({
    id: surface.id,
    label: surface.label,
  })),
  { id: 'other', label: 'Other Captures' },
] as const;

const GROUP_FILTERS: ReadonlyArray<{
  readonly id: 'all' | ScreenshotGroup;
  readonly label: string;
}> = [
  { id: 'all', label: 'All Groups' },
  ...Object.entries(GROUP_LABELS).map(([id, label]) => ({
    id: id as ScreenshotGroup,
    label,
  })),
] as const;

const CONSUMER_FILTERS: ReadonlyArray<{
  readonly id: 'all' | ScreenshotConsumer;
  readonly label: string;
}> = [
  { id: 'all', label: 'All Uses' },
  { id: 'marketing-export', label: 'Marketing Export' },
  { id: 'investor-ready', label: 'Investor Ready' },
] as const;

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function formatCaptureDate(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return 'Unknown';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(timestamp);
}

type DisplayScreenshotConsumer = Exclude<ScreenshotConsumer, 'admin'>;

function isDisplayConsumer(
  consumer: ScreenshotConsumer
): consumer is DisplayScreenshotConsumer {
  return consumer !== 'admin';
}

function formatConsumerLabel(consumer: DisplayScreenshotConsumer) {
  switch (consumer) {
    case 'marketing-export':
      return 'Marketing Export';
    case 'investor-ready':
      return 'Investor Ready';
  }
}

export function ScreenshotGallery({ screenshots }: ScreenshotGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [surfaceFilter, setSurfaceFilter] = useState<SurfaceFilter>('all');
  const [groupFilter, setGroupFilter] = useState<'all' | ScreenshotGroup>(
    'all'
  );
  const [consumerFilter, setConsumerFilter] = useState<
    'all' | ScreenshotConsumer
  >('all');
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
      <ContentSurfaceCard
        key={screenshot.id}
        className='group overflow-hidden rounded-lg bg-surface-0'
      >
        <button
          type='button'
          onClick={() => setSelectedIndex(globalIndex)}
          className='block w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)'
          aria-label={`View ${screenshot.title}`}
        >
          <div className='relative aspect-video overflow-hidden bg-surface-1'>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={screenshot.url}
              alt={screenshot.title}
              loading='lazy'
              decoding='async'
              className='h-full w-full object-cover object-top transition-transform duration-200 group-hover:scale-105'
            />
          </div>
        </button>

        <div className='flex items-center justify-between gap-3 p-3'>
          <div className='min-w-0'>
            <p className='truncate text-xs font-medium text-primary-token'>
              {screenshot.title}
            </p>
            <div className='mt-1 flex flex-wrap items-center gap-2 text-2xs text-secondary-token'>
              {screenshot.canonicalSurfaceLabel ? (
                <span className='rounded-full bg-surface-1 px-2 py-0.5'>
                  {screenshot.canonicalSurfaceLabel}
                </span>
              ) : null}
              <span className='rounded-full bg-surface-1 px-2 py-0.5'>
                {screenshot.viewport}
              </span>
              <span>{formatCaptureDate(screenshot.capturedAt)}</span>
              <span>{formatSize(screenshot.sizeBytes)}</span>
            </div>
            <div className='mt-2 flex flex-wrap gap-1.5'>
              <span className='rounded-full bg-surface-1 px-2 py-0.5 text-3xs text-secondary-token'>
                {screenshot.groupLabel}
              </span>
              {screenshot.consumers.filter(isDisplayConsumer).map(consumer => (
                <span
                  key={consumer}
                  className='rounded-full bg-surface-1 px-2 py-0.5 text-3xs text-secondary-token'
                >
                  {formatConsumerLabel(consumer)}
                </span>
              ))}
            </div>
          </div>
          <DrawerButton tone='ghost' size='icon' asChild>
            <a
              href={screenshot.url}
              download={`${screenshot.id}.png`}
              aria-label={`Download ${screenshot.title}`}
            >
              <Download className='size-3.5' />
            </a>
          </DrawerButton>
        </div>
      </ContentSurfaceCard>
    );
  }

  return (
    <>
      <div className='space-y-4' data-testid='admin-screenshots-content'>
        <ContentSurfaceCard className='space-y-4 p-4'>
          <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
            <div>
              <p className='text-xs font-semibold text-primary-token'>
                Filters
              </p>
              <p className='text-xs text-secondary-token'>
                Showing {filteredScreenshots.length} of {screenshots.length}{' '}
                captures. Canonical: {totalCanonicalCaptures}. Other:{' '}
                {totalOtherCaptures}.
              </p>
            </div>
            <div className='flex flex-wrap gap-2'>
              {SURFACE_FILTERS.map(filter => (
                <button
                  key={filter.id}
                  type='button'
                  onClick={() => setSurfaceFilter(filter.id)}
                  aria-pressed={surfaceFilter === filter.id}
                  className={`rounded-full border px-3 py-1.5 text-xs ${
                    surfaceFilter === filter.id
                      ? 'border-(--linear-accent) bg-(--linear-accent)/10 text-primary-token'
                      : 'border-subtle bg-surface-0 text-secondary-token'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
          <div className='space-y-2'>
            <p className='text-xs font-semibold text-primary-token'>
              Capture Group
            </p>
            <div className='flex flex-wrap gap-2'>
              {GROUP_FILTERS.map(filter => (
                <button
                  key={filter.id}
                  type='button'
                  onClick={() => setGroupFilter(filter.id)}
                  aria-pressed={groupFilter === filter.id}
                  className={`rounded-full border px-3 py-1.5 text-xs ${
                    groupFilter === filter.id
                      ? 'border-(--linear-accent) bg-(--linear-accent)/10 text-primary-token'
                      : 'border-subtle bg-surface-0 text-secondary-token'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
          <div className='space-y-2'>
            <p className='text-xs font-semibold text-primary-token'>Use Case</p>
            <div className='flex flex-wrap gap-2'>
              {CONSUMER_FILTERS.map(filter => (
                <button
                  key={filter.id}
                  type='button'
                  onClick={() => setConsumerFilter(filter.id)}
                  aria-pressed={consumerFilter === filter.id}
                  className={`rounded-full border px-3 py-1.5 text-xs ${
                    consumerFilter === filter.id
                      ? 'border-(--linear-accent) bg-(--linear-accent)/10 text-primary-token'
                      : 'border-subtle bg-surface-0 text-secondary-token'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
        </ContentSurfaceCard>

        {canonicalSections.length > 0 ? (
          <ContentSurfaceCard as='section' className='overflow-hidden'>
            <div className='border-b border-subtle px-4 py-3'>
              <h2 className='text-app font-semibold tracking-[-0.01em] text-primary-token'>
                Canonical Surfaces
              </h2>
              <p className='mt-1 text-xs text-secondary-token'>
                Review the four repo-owned design-system surfaces directly.
              </p>
            </div>
            <div className='space-y-4 p-4'>
              {canonicalSections.map(({ surface, items }) => (
                <ContentSurfaceCard
                  key={surface.id}
                  as='section'
                  className='overflow-hidden bg-surface-0'
                >
                  <div className='border-b border-subtle px-4 py-3'>
                    <div className='flex items-start justify-between gap-3'>
                      <div className='min-w-0'>
                        <h3 className='text-app font-semibold tracking-[-0.01em] text-primary-token'>
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
                  <div className='grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
                    {items.map(renderScreenshotCard)}
                  </div>
                </ContentSurfaceCard>
              ))}
            </div>
          </ContentSurfaceCard>
        ) : null}

        {otherGroups.size > 0 ? (
          <ContentSurfaceCard as='section' className='overflow-hidden'>
            <div className='border-b border-subtle px-4 py-3'>
              <h2 className='text-app font-semibold tracking-[-0.01em] text-primary-token'>
                Other Captures
              </h2>
              <p className='mt-1 text-xs text-secondary-token'>
                Supporting screenshot coverage outside the four canonical review
                surfaces.
              </p>
            </div>
            <div className='space-y-4 p-4'>
              {[...otherGroups.entries()].map(([sourceLabel, items]) => (
                <ContentSurfaceCard
                  key={sourceLabel}
                  as='section'
                  className='overflow-hidden bg-surface-0'
                >
                  <div className='flex items-center justify-between gap-3 border-b border-subtle px-4 py-3'>
                    <h3 className='truncate text-app font-semibold tracking-[-0.01em] text-primary-token'>
                      {sourceLabel}
                    </h3>
                    <span className='shrink-0 text-xs text-secondary-token'>
                      {items.length}
                    </span>
                  </div>
                  <div className='grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
                    {items.map(renderScreenshotCard)}
                  </div>
                </ContentSurfaceCard>
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

      {/* Lightbox modal */}
      <Dialog open={isOpen} onClose={handleClose} size='5xl'>
        <div className='flex items-center justify-between gap-4'>
          <DialogTitle className='truncate text-sm'>
            {selected?.title ?? 'Screenshot'}
          </DialogTitle>
          <div className='flex items-center gap-1 shrink-0'>
            <DrawerButton
              tone='ghost'
              size='icon'
              onClick={() =>
                setSelectedIndex(prev =>
                  prev !== null && prev > 0 ? prev - 1 : prev
                )
              }
              disabled={selectedIndex === 0}
              aria-label='Previous screenshot'
            >
              <ChevronLeft className='size-4' />
            </DrawerButton>
            <span className='text-xs text-secondary-token tabular-nums min-w-[4ch] text-center'>
              {selectedIndex === null ? 0 : selectedIndex + 1}/
              {filteredScreenshots.length}
            </span>
            <DrawerButton
              tone='ghost'
              size='icon'
              onClick={() =>
                setSelectedIndex(prev =>
                  prev !== null && prev < filteredScreenshotsCount - 1
                    ? prev + 1
                    : prev
                )
              }
              disabled={selectedIndex === filteredScreenshotsCount - 1}
              aria-label='Next screenshot'
            >
              <ChevronRight className='size-4' />
            </DrawerButton>
          </div>
        </div>
        <DialogBody>
          {selected && (
            <div className='space-y-4'>
              <ContentSurfaceCard className='overflow-hidden bg-surface-0'>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selected.url}
                  alt={selected.title}
                  className='w-full h-auto'
                />
              </ContentSurfaceCard>
              <ContentSurfaceCard className='flex items-center justify-between gap-4 bg-surface-0 p-3.5'>
                <div>
                  <p className='text-app font-semibold text-primary-token'>
                    {selected.title}
                  </p>
                  <div className='mt-1 flex flex-wrap gap-2 text-xs text-secondary-token'>
                    {selected.canonicalSurfaceLabel ? (
                      <>
                        <span>{selected.canonicalSurfaceLabel}</span>
                        <span>&middot;</span>
                      </>
                    ) : null}
                    <span>{selected.groupLabel}</span>
                    <span>&middot;</span>
                    <span>{selected.viewport}</span>
                    <span>&middot;</span>
                    <span>{formatCaptureDate(selected.capturedAt)}</span>
                    <span>&middot;</span>
                    <span>{formatSize(selected.sizeBytes)}</span>
                  </div>
                  {selected.canonicalSurfaceReviewRoute ? (
                    <p className='mt-1 text-2xs text-secondary-token'>
                      Review Route: {selected.canonicalSurfaceReviewRoute}
                    </p>
                  ) : null}
                  {selected.gitSha ? (
                    <p className='mt-1 text-2xs text-secondary-token'>
                      {selected.gitSha.slice(0, 8)}
                    </p>
                  ) : null}
                </div>
                <div className='flex items-center gap-2'>
                  {selected.publicUrl ? (
                    <DrawerButton tone='ghost' size='sm' asChild>
                      <a
                        href={selected.publicUrl}
                        target='_blank'
                        rel='noopener noreferrer'
                      >
                        Public Export
                      </a>
                    </DrawerButton>
                  ) : null}
                  <DrawerButton tone='secondary' size='sm' asChild>
                    <a href={selected.url} download={`${selected.id}.png`}>
                      <Download className='size-3.5 mr-1.5' />
                      Download
                    </a>
                  </DrawerButton>
                </div>
              </ContentSurfaceCard>
            </div>
          )}
        </DialogBody>
      </Dialog>
    </>
  );
}
