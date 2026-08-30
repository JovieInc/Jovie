import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ArtworkFrameSize = number | 'thumbnail' | 'default' | 'hero';

export type ArtworkMediaKind =
  | 'release'
  | 'merch'
  | 'video'
  | 'image'
  | 'avatar';

export const ARTWORK_FIT_CLASSNAME = 'object-contain';

export const APPROVED_ARTWORK_RADIUS_CLASSNAMES = [
  'rounded-xs',
  'rounded-lg',
  'rounded-xl',
] as const;

const ARTWORK_RADIUS_PX = {
  thumbnail: 2,
  default: 8,
  hero: 12,
} as const;

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

export function getArtworkRadiusPx(size: ArtworkFrameSize): number {
  return ARTWORK_RADIUS_PX[resolveArtworkFrameScale(size)];
}

export function getArtworkFitClassName(
  kind: ArtworkMediaKind = 'release'
): string {
  return kind === 'release' ? ARTWORK_FIT_CLASSNAME : 'object-cover';
}

export function isApprovedArtworkRadiusClassName(className: string): boolean {
  return (APPROVED_ARTWORK_RADIUS_CLASSNAMES as readonly string[]).includes(
    className
  );
}

/** Square-media frame. Owns scale-aware radius; release art uses contain. */
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
