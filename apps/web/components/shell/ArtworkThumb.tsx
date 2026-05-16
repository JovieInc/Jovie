'use client';

import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * ArtworkThumb — square artwork tile with a polished fallback.
 *
 * Preloads the source via the `Image()` constructor so we can detect failures
 * without attaching `onError` to a rendered `<img>` (sidesteps Next's
 * `@next/next/no-img-element` rule — we never render an `<img>`). On success
 * the source paints as a CSS background; on failure or while loading we render
 * deterministic abstract art instead of letter tiles that look like missing
 * album assets in recording frames.
 *
 * Pure leaf — owns no app state. Caller controls `src`, `title`, `size`.
 *
 * @example
 * ```tsx
 * <ArtworkThumb src={release.artwork} title={release.title} size={40} />
 * ```
 */
function hashTitle(title: string): number {
  let hash = 0;
  for (const char of title.trim() || 'release') {
    hash = (hash * 31 + char.charCodeAt(0)) % 997;
  }
  return hash;
}

function getFallbackStyle(title: string): CSSProperties {
  const hash = hashTitle(title);
  const hue = (hash * 47) % 360;
  const accentHue = (hue + 34 + (hash % 56)) % 360;
  const depthHue = (hue + 210) % 360;

  return {
    background: [
      `radial-gradient(circle at 28% 24%, oklch(0.78 0.12 ${accentHue}) 0 13%, transparent 34%)`,
      `radial-gradient(circle at 72% 78%, oklch(0.5 0.11 ${depthHue}) 0 16%, transparent 39%)`,
      `linear-gradient(${128 + (hash % 42)}deg, oklch(0.24 0.075 ${hue}), oklch(0.16 0.04 ${depthHue}) 62%, oklch(0.32 0.09 ${accentHue}))`,
    ].join(', '),
  };
}

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
            style={getFallbackStyle(title)}
          />
          <span
            aria-hidden='true'
            className='absolute inset-[1px] rounded-[3px] border border-white/10 bg-white/5'
          />
        </>
      )}
    </div>
  );
}
