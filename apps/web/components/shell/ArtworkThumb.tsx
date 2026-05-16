'use client';

import { Disc3 } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  getArtworkFallbackAccentStyle,
  getArtworkFallbackSurfaceStyle,
} from '@/lib/artwork-fallback';
import { cn } from '@/lib/utils';

/**
 * ArtworkThumb — square artwork tile with a polished fallback.
 *
 * Preloads the source via the `Image()` constructor so we can detect failures
 * without attaching `onError` to a rendered `<img>` (sidesteps Next's
 * `@next/next/no-img-element` rule — we never render an `<img>`). On success
 * the source paints as a CSS background; on failure or while loading we render
 * a deterministic cover tile instead of letter tiles that look like missing
 * album assets in recording frames.
 *
 * Pure leaf — owns no app state. Caller controls `src`, `title`, `size`.
 *
 * @example
 * ```tsx
 * <ArtworkThumb src={release.artwork} title={release.title} size={40} />
 * ```
 */
export function ArtworkThumb({
  src,
  title,
  size,
  className,
}: {
  readonly src: string;
  readonly title: string;
  readonly size: number;
  readonly className?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setErrored(false);
    if (typeof window === 'undefined') return;
    if (!src.trim()) {
      setErrored(true);
      return;
    }
    const img = new window.Image();
    img.onload = () => setLoaded(true);
    img.onerror = () => setErrored(true);
    img.src = src;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);

  const isLoaded = loaded && !errored;

  return (
    <div
      className={cn(
        'relative rounded-sm overflow-hidden shrink-0 bg-surface-1',
        className
      )}
      data-artwork-state={isLoaded ? 'image' : 'fallback'}
      style={{ height: size, width: size }}
    >
      {isLoaded ? (
        <span
          aria-hidden='true'
          className='absolute inset-0 bg-cover bg-center'
          style={{ backgroundImage: `url(${src})` }}
        />
      ) : (
        <>
          <span
            aria-hidden='true'
            className='absolute inset-0'
            data-artwork-fallback='true'
            style={getArtworkFallbackSurfaceStyle(title)}
          />
          <span
            aria-hidden='true'
            className='absolute inset-0 grid place-items-center text-white/25'
          >
            <Disc3 className='h-[42%] w-[42%]' strokeWidth={1.85} />
          </span>
          <span
            aria-hidden='true'
            className='absolute inset-x-0 bottom-0 h-1'
            style={getArtworkFallbackAccentStyle(title)}
          />
          <span
            aria-hidden='true'
            className='absolute inset-[1px] rounded-[3px] border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
          />
        </>
      )}
    </div>
  );
}
