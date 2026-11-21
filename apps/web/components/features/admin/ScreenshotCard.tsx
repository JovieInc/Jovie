import { Button } from '@jovie/ui';
import { Download } from 'lucide-react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { DrawerButton } from '@/components/molecules/drawer';
import type { ScreenshotInfo } from '@/lib/admin/types';
import {
  formatCaptureDate,
  formatConsumerLabel,
  formatSize,
  isDisplayConsumer,
} from './ScreenshotGallery.helpers';

interface ScreenshotCardProps {
  readonly screenshot: ScreenshotInfo;
  readonly onOpen: () => void;
}

/** One capture in the gallery grid: preview, metadata chips and a download link. */
export function ScreenshotCard({
  screenshot,
  onOpen,
}: Readonly<ScreenshotCardProps>) {
  return (
    <ContentSurfaceCard surface='nested' className='group overflow-hidden'>
      <Button
        type='button'
        variant='ghost'
        onClick={onOpen}
        className='block h-auto w-full cursor-pointer rounded-none p-0 hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        aria-label={`View ${screenshot.title}`}
      >
        <div className='relative aspect-video w-full overflow-hidden bg-surface-1'>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={screenshot.url}
            alt={screenshot.title}
            width={640}
            height={360}
            loading='lazy'
            decoding='async'
            className='h-full w-full object-cover object-top'
          />
        </div>
      </Button>

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
