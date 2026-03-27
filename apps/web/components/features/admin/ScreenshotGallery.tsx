'use client';

import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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

type DisplayScreenshotConsumer = Exclude<ScreenshotConsumer, 'admin'>;

const CONSUMER_LABELS: Record<DisplayScreenshotConsumer, string> = {
  'marketing-export': 'Marketing Export',
  'investor-ready': 'Investor Ready',
};

const CONSUMER_FILTERS: ReadonlyArray<{
  readonly id: 'all' | DisplayScreenshotConsumer;
  readonly label: string;
}> = [
  { id: 'all', label: 'All Uses' },
  ...Object.entries(CONSUMER_LABELS).map(([id, label]) => ({
    id: id as DisplayScreenshotConsumer,
    label,
  })),
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
    timeZone: 'UTC',
  }).format(timestamp);
}

function isDisplayConsumer(
  consumer: ScreenshotConsumer
): consumer is DisplayScreenshotConsumer {
  return consumer !== 'admin';
}

function formatConsumerLabel(consumer: DisplayScreenshotConsumer) {
  return CONSUMER_LABELS[consumer];
}

export function ScreenshotGallery({ screenshots }: ScreenshotGalleryProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<'all' | ScreenshotGroup>(
    'all'
  );
  const [consumerFilter, setConsumerFilter] = useState<
    'all' | DisplayScreenshotConsumer
  >('all');
  const filteredScreenshots = screenshots.filter(screenshot => {
    const groupMatch =
      groupFilter === 'all' || screenshot.group === groupFilter;
    const consumerMatch =
      consumerFilter === 'all' || screenshot.consumers.includes(consumerFilter);
    return groupMatch && consumerMatch;
  });
  const selected =
    selectedId === null
      ? null
      : (filteredScreenshots.find(screenshot => screenshot.id === selectedId) ??
        null);
  const selectedIndex =
    selected === null
      ? -1
      : filteredScreenshots.findIndex(
          screenshot => screenshot.id === selected.id
        );
  const isOpen = selected !== null;
  const filteredScreenshotsCount = filteredScreenshots.length;
  const selectedIndexRef = useRef(selectedIndex);
  const filteredScreenshotsRef = useRef(filteredScreenshots);

  function handleClose() {
    setSelectedId(null);
  }

  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
    filteredScreenshotsRef.current = filteredScreenshots;
  }, [filteredScreenshots, selectedIndex]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      const currentIndex = selectedIndexRef.current;
      const currentScreenshots = filteredScreenshotsRef.current;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const previousScreenshot = currentScreenshots[currentIndex - 1];
        if (previousScreenshot) {
          setSelectedId(previousScreenshot.id);
        }
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const nextScreenshot = currentScreenshots[currentIndex + 1];
        if (nextScreenshot) {
          setSelectedId(nextScreenshot.id);
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen]);

  useEffect(() => {
    setSelectedId(null);
  }, [groupFilter, consumerFilter]);

  useEffect(() => {
    if (selectedId !== null && selected === null) {
      setSelectedId(null);
    }
  }, [selected, selectedId]);

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
                  aria-pressed={groupFilter === filter.id}
                  className={`rounded-full border px-3 py-1.5 text-[12px] ${
                    groupFilter === filter.id
                      ? 'border-focus bg-surface-1 text-primary-token'
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
                aria-pressed={consumerFilter === filter.id}
                className={`rounded-full border px-3 py-1.5 text-[12px] ${
                  consumerFilter === filter.id
                    ? 'border-focus bg-surface-1 text-primary-token'
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
                return (
                  <ContentSurfaceCard
                    key={ss.id}
                    className='group overflow-hidden rounded-lg bg-surface-0'
                  >
                    <button
                      type='button'
                      onClick={() => setSelectedId(ss.id)}
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
              onClick={() => {
                const previousScreenshot =
                  filteredScreenshots[selectedIndex - 1];
                if (previousScreenshot) {
                  setSelectedId(previousScreenshot.id);
                }
              }}
              disabled={selectedIndex <= 0}
              aria-label='Previous screenshot'
            >
              <ChevronLeft className='size-4' />
            </DrawerButton>
            <span className='text-xs text-secondary-token tabular-nums min-w-[4ch] text-center'>
              {selectedIndex < 0 ? 0 : selectedIndex + 1}/
              {filteredScreenshots.length}
            </span>
            <DrawerButton
              tone='ghost'
              size='icon'
              onClick={() => {
                const nextScreenshot = filteredScreenshots[selectedIndex + 1];
                if (nextScreenshot) {
                  setSelectedId(nextScreenshot.id);
                }
              }}
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
