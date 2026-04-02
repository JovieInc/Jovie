'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

interface ProductScreenshotProps {
  /** Path to the screenshot image in /public */
  readonly src: string;
  /** Alt text for accessibility */
  readonly alt: string;
  /** Natural width of the source image (2x retina) */
  readonly width: number;
  /** Natural height of the source image (2x retina) */
  readonly height: number;
  /** Title shown in the window chrome title bar */
  readonly title?: string;
  /** Whether to preload the image (set true for above-the-fold) */
  readonly priority?: boolean;
  /** Additional className for the outer wrapper */
  readonly className?: string;
  /** Additional className for the image itself */
  readonly imageClassName?: string;
  /** Skip the HEAD availability check — render the image immediately.
   *  Use for committed screenshots where the file is guaranteed to exist.
   *  This preserves the next/image priority preload for above-fold images. */
  readonly skipCheck?: boolean;
  /** Stable test selector for screenshot wrapper assertions. */
  readonly testId?: string;
  /** Visual frame treatment around the screenshot. */
  readonly chrome?: 'window' | 'minimal';
}

/**
 * Renders a real product screenshot inside Mac-style window chrome.
 * Drop-in replacement for hand-coded dashboard/analytics mockups.
 */
export function ProductScreenshot({
  src,
  alt,
  width,
  height,
  title = 'Jovie',
  priority = false,
  className,
  imageClassName,
  skipCheck = false,
  testId,
  chrome = 'window',
}: ProductScreenshotProps) {
  const [isAvailable, setIsAvailable] = useState<boolean | null>(
    skipCheck ? true : null
  );
  const aspectRatio = `${width} / ${height}`;

  useEffect(() => {
    if (skipCheck) return;
    let isActive = true;

    fetch(src, { method: 'HEAD' })
      .then(response => {
        if (isActive) {
          const contentType = response.headers.get('content-type') ?? '';
          setIsAvailable(response.ok && contentType.startsWith('image/'));
        }
      })
      .catch(() => {
        if (isActive) {
          setIsAvailable(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [src, skipCheck]);

  return (
    <figure
      aria-label={alt}
      data-testid={testId}
      className={[
        'relative overflow-hidden rounded-[0.95rem] border border-subtle bg-surface-0 shadow-card-elevated md:rounded-[1rem]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        boxShadow:
          '0 0 0 1px var(--linear-app-shell-border), var(--linear-shadow-card-elevated)',
      }}
    >
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-x-0 top-0 z-10 h-px'
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(255,255,255,0.16) 24%, rgba(255,255,255,0.22) 50%, rgba(255,255,255,0.16) 76%, transparent)',
        }}
      />

      {chrome === 'window' ? (
        <div className='flex h-10 items-center border-b border-subtle bg-surface-1 px-4 sm:px-5'>
          <div className='flex gap-2' aria-hidden='true'>
            <div className='h-3 w-3 rounded-full border border-black/10 bg-[#ED6A5E]' />
            <div className='h-3 w-3 rounded-full border border-black/10 bg-[#F4BF4F]' />
            <div className='h-3 w-3 rounded-full border border-black/10 bg-[#61C554]' />
          </div>
          <div className='flex-1 text-center text-xs text-tertiary-token'>
            {title}
          </div>
          <div className='w-[52px]' />
        </div>
      ) : null}

      {/* Screenshot image */}
      {(() => {
        if (isAvailable === false) {
          return (
            <div
              className='grid w-full place-items-center bg-[radial-gradient(circle_at_top,rgba(113,112,255,0.12),transparent_44%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))] px-6 py-10 text-center'
              style={{ aspectRatio }}
            >
              <div className='max-w-[22rem]'>
                <div className='mb-4 inline-flex rounded-full border border-subtle bg-surface-1 px-3 py-1 text-xs text-tertiary-token'>
                  {title}
                </div>
                <p className='text-lg font-medium tracking-tight text-primary-token'>
                  Preview coming soon
                </p>
                <p className='mt-2 text-sm leading-6 text-secondary-token'>
                  See it live when you sign up.
                </p>
              </div>
            </div>
          );
        }
        if (isAvailable === true) {
          return (
            <Image
              src={src}
              alt={alt}
              width={width}
              height={height}
              priority={priority}
              className={['w-full', imageClassName].filter(Boolean).join(' ')}
            />
          );
        }
        return (
          <div
            className='w-full animate-pulse bg-surface-1'
            style={{ aspectRatio }}
          />
        );
      })()}
    </figure>
  );
}
