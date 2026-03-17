'use client';

import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { DrawerButton } from '@/components/molecules/drawer';
import { Dialog, DialogBody, DialogTitle } from '@/components/organisms/Dialog';
import type { ScreenshotInfo } from '@/lib/admin/screenshots';

interface ScreenshotGalleryProps {
  readonly screenshots: readonly ScreenshotInfo[];
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export function ScreenshotGallery({ screenshots }: ScreenshotGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const isOpen = selectedIndex !== null;
  const selected = selectedIndex === null ? null : screenshots[selectedIndex];

  const handleClose = useCallback(() => setSelectedIndex(null), []);

  const handlePrev = useCallback(() => {
    setSelectedIndex(prev => (prev !== null && prev > 0 ? prev - 1 : prev));
  }, []);

  const handleNext = useCallback(() => {
    setSelectedIndex(prev =>
      prev !== null && prev < screenshots.length - 1 ? prev + 1 : prev
    );
  }, [screenshots.length]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, handlePrev, handleNext]);

  // Build O(1) lookup map from screenshot id to its global index
  const indexMap = new Map(screenshots.map((s, i) => [s.id, i]));

  // Group by source for section headings
  const grouped = new Map<string, ScreenshotInfo[]>();
  for (const ss of screenshots) {
    const group = grouped.get(ss.sourceLabel) ?? [];
    group.push(ss);
    grouped.set(ss.sourceLabel, group);
  }

  return (
    <>
      <div className='space-y-4' data-testid='admin-screenshots-content'>
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
                    className='group overflow-hidden rounded-[10px] bg-surface-0'
                  >
                    <button
                      type='button'
                      onClick={() => setSelectedIndex(globalIndex)}
                      className='block w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)'
                      aria-label={`View ${ss.name}`}
                    >
                      <div className='relative aspect-video overflow-hidden bg-surface-1'>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={ss.url}
                          alt={ss.name}
                          loading='lazy'
                          decoding='async'
                          className='h-full w-full object-cover object-top transition-transform duration-200 group-hover:scale-105'
                        />
                      </div>
                    </button>

                    <div className='flex items-center justify-between gap-3 p-3'>
                      <div className='min-w-0'>
                        <p className='truncate text-[12px] font-[510] text-primary-token'>
                          {ss.filename}
                        </p>
                        <p className='text-[11px] text-secondary-token'>
                          {formatSize(ss.sizeBytes)}
                        </p>
                      </div>
                      <DrawerButton tone='ghost' size='icon' asChild>
                        <a
                          href={ss.url}
                          download={ss.filename}
                          aria-label={`Download ${ss.filename}`}
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
            {selected?.name ?? 'Screenshot'}
          </DialogTitle>
          <div className='flex items-center gap-1 shrink-0'>
            <DrawerButton
              tone='ghost'
              size='icon'
              onClick={handlePrev}
              disabled={selectedIndex === 0}
              aria-label='Previous screenshot'
            >
              <ChevronLeft className='size-4' />
            </DrawerButton>
            <span className='text-xs text-secondary-token tabular-nums min-w-[4ch] text-center'>
              {selectedIndex === null ? 0 : selectedIndex + 1}/
              {screenshots.length}
            </span>
            <DrawerButton
              tone='ghost'
              size='icon'
              onClick={handleNext}
              disabled={selectedIndex === screenshots.length - 1}
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
                  alt={selected.name}
                  className='w-full h-auto'
                />
              </ContentSurfaceCard>
              <ContentSurfaceCard className='flex items-center justify-between gap-4 bg-surface-0 p-3.5'>
                <div>
                  <p className='text-[13px] font-[560] text-primary-token'>
                    {selected.filename}
                  </p>
                  <p className='text-[12px] text-secondary-token'>
                    {selected.sourceLabel} &middot;{' '}
                    {formatSize(selected.sizeBytes)}
                  </p>
                </div>
                <DrawerButton tone='secondary' size='sm' asChild>
                  <a href={selected.url} download={selected.filename}>
                    <Download className='size-3.5 mr-1.5' />
                    Download
                  </a>
                </DrawerButton>
              </ContentSurfaceCard>
            </div>
          )}
        </DialogBody>
      </Dialog>
    </>
  );
}
