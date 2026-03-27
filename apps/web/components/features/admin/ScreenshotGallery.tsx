'use client';

import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { DrawerButton } from '@/components/molecules/drawer';
import { Dialog, DialogBody, DialogTitle } from '@/components/organisms/Dialog';
import type { ScreenshotInfo } from '@/lib/admin/screenshots';
import { GROUP_LABELS } from '@/lib/screenshots/registry';
import type {
  ScreenshotConsumer,
  ScreenshotGroup,
} from '@/lib/screenshots/types';

interface ScreenshotGalleryProps {
  readonly screenshots: readonly ScreenshotInfo[];
}

const GROUP_FILTERS: ReadonlyArray<{
  readonly id: 'all' | ScreenshotGroup;
  readonly label: string;
}> = [
  { id: 'all', label: 'All' },
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
  const [groupFilter, setGroupFilter] = useState<'all' | ScreenshotGroup>(
    'all'
  );
  const [consumerFilter, setConsumerFilter] = useState<
    'all' | ScreenshotConsumer
  >('all');
  const isOpen = selectedIndex !== null;
  const filteredScreenshots = screenshots.filter(screenshot => {
    const groupMatch =
      groupFilter === 'all' || screenshot.group === groupFilter;
    const consumerMatch =
      consumerFilter === 'all' || screenshot.consumers.includes(consumerFilter);
    return groupMatch && consumerMatch;
  });
  const selected =
    selectedIndex === null ? null : filteredScreenshots[selectedIndex];
  const filteredScreenshotsCount = filteredScreenshots.length;

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
  }, [groupFilter, consumerFilter]);

  const indexMap = new Map(filteredScreenshots.map((s, i) => [s.id, i]));
  const grouped = new Map<string, ScreenshotInfo[]>();
  for (const ss of filteredScreenshots) {
    const group = grouped.get(ss.groupLabel) ?? [];
    group.push(ss);
    grouped.set(ss.groupLabel, group);
  }

  return (
    <>
      <div className='space-y-4' data-testid='admin-screenshots-content'>
        <ContentSurfaceCard className='space-y-4 p-4'>
          <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
            <div>
              <p className='text-[12px] font-[560] text-primary-token'>
                Filters
              </p>
              <p className='text-[12px] text-secondary-token'>
                Showing {filteredScreenshots.length} of {screenshots.length}{' '}
                surfaces.
              </p>
            </div>
            <div className='flex flex-wrap gap-2'>
              {GROUP_FILTERS.map(filter => (
                <button
                  key={filter.id}
                  type='button'
                  onClick={() => setGroupFilter(filter.id)}
                  className={`rounded-full border px-3 py-1.5 text-[12px] ${
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
          <div className='flex flex-wrap gap-2'>
            {CONSUMER_FILTERS.map(filter => (
              <button
                key={filter.id}
                type='button'
                onClick={() => setConsumerFilter(filter.id)}
                className={`rounded-full border px-3 py-1.5 text-[12px] ${
                  consumerFilter === filter.id
                    ? 'border-(--linear-accent) bg-(--linear-accent)/10 text-primary-token'
                    : 'border-subtle bg-surface-0 text-secondary-token'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </ContentSurfaceCard>

        {[...grouped.entries()].map(([sourceLabel, items]) => (
          <ContentSurfaceCard
            key={sourceLabel}
            as='section'
            className='overflow-hidden'
          >
            <div className='flex items-center justify-between gap-3 border-b border-subtle px-4 py-3'>
              <h2 className='truncate text-[13px] font-[560] tracking-[-0.01em] text-primary-token'>
                {sourceLabel}
              </h2>
              <span className='shrink-0 text-[12px] text-secondary-token'>
                {items.length}
              </span>
            </div>
            <div className='grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
              {items.map(ss => {
                const globalIndex = indexMap.get(ss.id) ?? 0;
                return (
                  <ContentSurfaceCard
                    key={ss.id}
                    className='group overflow-hidden rounded-lg bg-surface-0'
                  >
                    <button
                      type='button'
                      onClick={() => setSelectedIndex(globalIndex)}
                      className='block w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)'
                      aria-label={`View ${ss.title}`}
                    >
                      <div className='relative aspect-video overflow-hidden bg-surface-1'>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={ss.url}
                          alt={ss.title}
                          loading='lazy'
                          decoding='async'
                          className='h-full w-full object-cover object-top transition-transform duration-200 group-hover:scale-105'
                        />
                      </div>
                    </button>

                    <div className='flex items-center justify-between gap-3 p-3'>
                      <div className='min-w-0'>
                        <p className='truncate text-[12px] font-[510] text-primary-token'>
                          {ss.title}
                        </p>
                        <div className='mt-1 flex flex-wrap items-center gap-2 text-[11px] text-secondary-token'>
                          <span className='rounded-full bg-surface-1 px-2 py-0.5'>
                            {ss.viewport}
                          </span>
                          <span>{formatCaptureDate(ss.capturedAt)}</span>
                          <span>{formatSize(ss.sizeBytes)}</span>
                        </div>
                        <div className='mt-2 flex flex-wrap gap-1.5'>
                          {ss.consumers
                            .filter(isDisplayConsumer)
                            .map(consumer => (
                              <span
                                key={consumer}
                                className='rounded-full bg-surface-1 px-2 py-0.5 text-[10px] text-secondary-token'
                              >
                                {formatConsumerLabel(consumer)}
                              </span>
                            ))}
                        </div>
                      </div>
                      <DrawerButton tone='ghost' size='icon' asChild>
                        <a
                          href={ss.url}
                          download={`${ss.id}.png`}
                          aria-label={`Download ${ss.title}`}
                        >
                          <Download className='size-3.5' />
                        </a>
                      </DrawerButton>
                    </div>
                  </ContentSurfaceCard>
                );
              })}
            </div>
          </ContentSurfaceCard>
        ))}
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
                  <p className='text-[13px] font-[560] text-primary-token'>
                    {selected.title}
                  </p>
                  <div className='mt-1 flex flex-wrap gap-2 text-[12px] text-secondary-token'>
                    <span>{selected.groupLabel}</span>
                    <span>&middot;</span>
                    <span>{selected.viewport}</span>
                    <span>&middot;</span>
                    <span>{formatCaptureDate(selected.capturedAt)}</span>
                    <span>&middot;</span>
                    <span>{formatSize(selected.sizeBytes)}</span>
                  </div>
                  {selected.gitSha ? (
                    <p className='mt-1 text-[11px] text-secondary-token'>
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
                        rel='noreferrer'
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
