import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { DrawerButton } from '@/components/molecules/drawer';
import { Dialog, DialogBody, DialogTitle } from '@/components/organisms/Dialog';
import type { ScreenshotInfo } from '@/lib/admin/types';
import { formatCaptureDate, formatSize } from './ScreenshotGallery.helpers';

interface ScreenshotLightboxProps {
  readonly open: boolean;
  readonly selected: ScreenshotInfo | null;
  /** Zero-based position of the selected capture, or null when closed. */
  readonly index: number | null;
  readonly count: number;
  readonly onClose: () => void;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
}

/** Full-size view of one capture with previous and next controls. */
export function ScreenshotLightbox({
  open,
  selected,
  index,
  count,
  onClose,
  onPrevious,
  onNext,
}: Readonly<ScreenshotLightboxProps>) {
  return (
    <Dialog open={open} onClose={onClose} size='5xl'>
      <div className='flex items-center justify-between gap-4'>
        <DialogTitle className='truncate text-sm'>
          {selected?.title ?? 'Screenshot'}
        </DialogTitle>
        <div className='flex items-center gap-1 shrink-0'>
          <DrawerButton
            tone='ghost'
            size='icon'
            onClick={onPrevious}
            disabled={index === 0}
            aria-label='Previous Screenshot'
          >
            <ChevronLeft className='size-4' />
          </DrawerButton>
          <span className='text-xs text-secondary-token tabular-nums min-w-[4ch] text-center'>
            {index === null ? 0 : index + 1}/{count}
          </span>
          <DrawerButton
            tone='ghost'
            size='icon'
            onClick={onNext}
            disabled={index === count - 1}
            aria-label='Next Screenshot'
          >
            <ChevronRight className='size-4' />
          </DrawerButton>
        </div>
      </div>
      <DialogBody>
        {selected && (
          <div className='space-y-4'>
            <ContentSurfaceCard surface='nested' className='overflow-hidden'>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selected.url}
                alt={selected.title}
                width={1440}
                height={900}
                className='h-auto w-full'
              />
            </ContentSurfaceCard>
            <div className='flex items-center justify-between gap-4'>
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
            </div>
          </div>
        )}
      </DialogBody>
    </Dialog>
  );
}
