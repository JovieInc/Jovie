'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * ArtworkThumb — square artwork tile with first-letter fallback.
 *
 * Preloads the source via the `Image()` constructor so we can detect failures
 * without attaching `onError` to a rendered `<img>` (sidesteps Next's
 * `@next/next/no-img-element` rule — we never render an `<img>`). On success
 * the source paints as a CSS background; on failure or while loading we
 * render the title's first uppercase letter as a calm placeholder.
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
    const img = new window.Image();
    img.onload = () => setLoaded(true);
    img.onerror = () => setErrored(true);
    img.src = src;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);

  const fallbackLetter = title.trim().charAt(0).toUpperCase() || '·';

  return (
    <div
      className={cn(
        'relative rounded-sm overflow-hidden shrink-0 bg-surface-1 grid place-items-center',
        className
      )}
      style={{ height: size, width: size }}
    >
      {loaded && !errored ? (
        <span
          aria-hidden='true'
          className='absolute inset-0 bg-cover bg-center'
          style={{ backgroundImage: `url(${src})` }}
        />
      ) : (
        <span className='text-[10px] font-caption text-tertiary-token tracking-tight'>
          {fallbackLetter}
        </span>
      )}
    </div>
  );
}
