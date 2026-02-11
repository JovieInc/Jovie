'use client';

import { Button } from '@jovie/ui';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

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
  const selected = selectedIndex !== null ? screenshots[selectedIndex] : null;

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
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, handlePrev, handleNext]);

  // Group by source for section headings
  const grouped = new Map<string, ScreenshotInfo[]>();
  for (const ss of screenshots) {
    const group = grouped.get(ss.sourceLabel) ?? [];
    group.push(ss);
    grouped.set(ss.sourceLabel, group);
  }

  return (
    <>
      <div className='space-y-8'>
        {[...grouped.entries()].map(([sourceLabel, items]) => (
          <section key={sourceLabel}>
            <h2 className='text-sm font-semibold text-primary-token mb-3'>
              {sourceLabel}
              <span className='ml-2 text-xs font-normal text-secondary-token'>
                ({items.length})
              </span>
            </h2>
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
              {items.map(ss => {
                const globalIndex = screenshots.indexOf(ss);
                return (
                  <div
                    key={ss.id}
                    className='group rounded-xl border border-subtle bg-surface-1 overflow-hidden'
                  >
                    <button
                      type='button'
                      onClick={() => setSelectedIndex(globalIndex)}
                      className='block w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
                      aria-label={`View ${ss.name}`}
                    >
                      <div className='aspect-video bg-surface-2 relative overflow-hidden'>
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

                    <div className='p-3 flex items-center justify-between gap-2'>
                      <div className='min-w-0'>
                        <p className='text-xs font-medium text-primary-token truncate'>
                          {ss.filename}
                        </p>
                        <p className='text-xs text-secondary-token'>
                          {formatSize(ss.sizeBytes)}
                        </p>
                      </div>
                      <Button variant='ghost' size='sm' asChild>
                        <a
                          href={ss.url}
                          download={ss.filename}
                          aria-label={`Download ${ss.filename}`}
                        >
                          <Download className='size-3.5' />
                        </a>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Lightbox modal */}
      <Dialog open={isOpen} onClose={handleClose} size='5xl'>
        <div className='flex items-center justify-between gap-4'>
          <DialogTitle className='truncate text-sm'>
            {selected?.name ?? 'Screenshot'}
          </DialogTitle>
          <div className='flex items-center gap-1 shrink-0'>
            <Button
              variant='ghost'
              size='sm'
              onClick={handlePrev}
              disabled={selectedIndex === 0}
              aria-label='Previous screenshot'
            >
              <ChevronLeft className='size-4' />
            </Button>
            <span className='text-xs text-secondary-token tabular-nums min-w-[4ch] text-center'>
              {selectedIndex !== null ? selectedIndex + 1 : 0}/
              {screenshots.length}
            </span>
            <Button
              variant='ghost'
              size='sm'
              onClick={handleNext}
              disabled={selectedIndex === screenshots.length - 1}
              aria-label='Next screenshot'
            >
              <ChevronRight className='size-4' />
            </Button>
          </div>
        </div>
        <DialogBody>
          {selected && (
            <div className='space-y-4'>
              <div className='rounded-lg overflow-hidden border border-subtle bg-surface-2'>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selected.url}
                  alt={selected.name}
                  className='w-full h-auto'
                />
              </div>
              <div className='flex items-center justify-between'>
                <div>
                  <p className='text-sm text-primary-token font-medium'>
                    {selected.filename}
                  </p>
                  <p className='text-xs text-secondary-token'>
                    {selected.sourceLabel} &middot;{' '}
                    {formatSize(selected.sizeBytes)}
                  </p>
                </div>
                <Button variant='secondary' size='sm' asChild>
                  <a href={selected.url} download={selected.filename}>
                    <Download className='size-3.5 mr-1.5' />
                    Download
                  </a>
                </Button>
              </div>
            </div>
          )}
        </DialogBody>
      </Dialog>
    </>
  );
}
