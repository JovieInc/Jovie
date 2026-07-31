import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ArtworkFrameSize = number | 'thumbnail' | 'default' | 'hero';

interface ArtworkFrameProps
  extends Readonly<Omit<HTMLAttributes<HTMLDivElement>, 'children'>> {
  readonly children?: ReactNode;
  /**
   * Artwork corners scale with the rendered media, not the surrounding card.
   * Tiny table/search thumbnails stay nearly square so the frame does not
   * visibly reshape the artwork.
   */
  readonly size: ArtworkFrameSize;
}

function resolveArtworkFrameScale(
  size: ArtworkFrameSize
): 'thumbnail' | 'default' | 'hero' {
  if (typeof size !== 'number') return size;
  if (size <= 48) return 'thumbnail';
  if (size >= 160) return 'hero';
  return 'default';
}

export function getArtworkRadiusClassName(size: ArtworkFrameSize): string {
  const scale = resolveArtworkFrameScale(size);
  if (scale === 'thumbnail') return 'rounded-xs';
  if (scale === 'hero') return 'rounded-xl';
  return 'rounded-lg';
}

/**
 * Canonical square-media frame for album art, merch, and release thumbnails.
 * It owns only clipping geometry: callers still own dimensions and imagery.
 */
export function ArtworkFrame({
  children,
  className,
  size,
  ...props
}: ArtworkFrameProps) {
  const scale = resolveArtworkFrameScale(size);

  return (
    <div
      {...props}
      className={cn(
        className,
        'relative shrink-0 overflow-hidden border-0 outline-none shadow-none',
        getArtworkRadiusClassName(scale)
      )}
      data-artwork-frame={scale}
    >
      {children}
    </div>
  );
}
