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
  /** Skip the HEAD availability check — render the image immediately.
   *  Use for committed screenshots where the file is guaranteed to exist.
   *  This preserves the next/image priority preload for above-fold images. */
  readonly skipCheck?: boolean;
  /** Stable test selector for screenshot wrapper assertions. */
  readonly testId?: string;
}

/**
 * Renders a product screenshot with minimal wrapper — rounded corners,
 * subtle border, and elevated shadow. No browser chrome.
 */
export function ProductScreenshot({
  src,
  alt,
  width,
  height,
  priority = false,
  className,
  skipCheck = false,
  testId,
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
        'relative overflow-hidden rounded-xl border md:rounded-2xl',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        borderColor: 'rgba(255,255,255,0.08)',
        boxShadow: '0 20px 50px rgba(0,0,0,0.25), 0 8px 20px rgba(0,0,0,0.15)',
      }}
    >
      {/* Top shine */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-x-0 top-0 z-10 h-px'
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(255,255,255,0.1) 30%, rgba(255,255,255,0.14) 50%, rgba(255,255,255,0.1) 70%, transparent)',
        }}
      />

      {/* Screenshot image */}
      {isAvailable === false ? (
        <div
          className='grid w-full place-items-center bg-surface-1 px-6 py-10 text-center'
          style={{ aspectRatio }}
        >
          <div className='max-w-[22rem]'>
            <p className='text-lg font-medium tracking-tight text-primary-token'>
              Preview coming soon
            </p>
            <p className='mt-2 text-sm leading-6 text-secondary-token'>
              See it live when you sign up.
            </p>
          </div>
        </div>
      ) : isAvailable === true ? (
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          priority={priority}
          className='w-full'
        />
      ) : (
        <div
          className='w-full animate-pulse bg-surface-1'
          style={{ aspectRatio }}
        />
      )}
    </figure>
  );
}
