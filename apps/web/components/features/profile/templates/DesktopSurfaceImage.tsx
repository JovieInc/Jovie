'use client';

import { getImageProps } from 'next/image';
import type { ComponentProps } from 'react';
import { preload } from 'react-dom';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import { shouldBypassImageOptimization } from '@/lib/utils/dsp-images';

/**
 * Width at which the wide desktop profile surface replaces the compact one
 * (design-system.css `.profile-viewport--desktop-surface`, and the
 * `matchMedia('(min-width: 1180px)')` sync in ProfileCompactTemplate).
 */
export const PROFILE_DESKTOP_SURFACE_MEDIA_QUERY = '(min-width: 1180px)';

type DesktopSurfaceImageProps = Omit<
  ComponentProps<typeof ImageWithFallback>,
  'priority' | 'preload' | 'loading' | 'sizes' | 'fill'
> & {
  /** Required: the preload must pick the same candidate as the `<img>`. */
  readonly sizes: string;
};

/**
 * Above-the-fold image of the desktop profile surface.
 *
 * The desktop surface is server-rendered next to the compact (phone) surface
 * and only shown by CSS at >= 1180px. A plain `priority` image there emits an
 * unconditional `<link rel="preload">`, so every phone downloaded a 60vw
 * desktop cover it never shows, competing with the real LCP image on the
 * claim-invite landing (JOV-9611).
 *
 * Here the preload is scoped to the desktop breakpoint with `media`, and the
 * `<img>` itself is lazy: on desktop it is in the viewport and resolves from
 * the preloaded response at high priority; on phones its container is
 * `display: none`, so nothing is fetched at all.
 */
export function DesktopSurfaceImage({
  src,
  sizes,
  ...rest
}: DesktopSurfaceImageProps) {
  const sourceUrl = typeof src === 'string' && src.length > 0 ? src : null;

  if (sourceUrl) {
    const { props } = getImageProps({
      src: sourceUrl,
      alt: '',
      fill: true,
      sizes,
      quality: rest.quality,
      unoptimized: shouldBypassImageOptimization(sourceUrl),
    });
    preload(props.src, {
      as: 'image',
      imageSrcSet: props.srcSet,
      imageSizes: props.srcSet ? props.sizes : undefined,
      fetchPriority: 'high',
      media: PROFILE_DESKTOP_SURFACE_MEDIA_QUERY,
    });
  }

  return (
    <ImageWithFallback {...rest} src={src} fill sizes={sizes} loading='lazy' />
  );
}
