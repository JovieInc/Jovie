import Image from 'next/image';
import { cn } from '@/lib/utils';

export interface MarketingHeroPhotoProps {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  /**
   * Extra dimming for source photography that is bright overall (0-1).
   * The left-to-right and top scrims already guarantee headline and header
   * legibility; this only tunes overall image strength per the founder
   * hero-image table (e.g. /ai, /download call for ~0.20-0.22).
   */
  readonly opacity?: number;
  readonly priority?: boolean;
  readonly className?: string;
}

/**
 * Decorative, unique-per-route hero photograph (marketing-routes-code-spec,
 * 2026-09-26). Renders inside the existing `.relative overflow-hidden` hero
 * wrapper, behind the hero copy. Purely decorative — `alt=''` — so it never
 * competes with the real hero heading for assistive-tech attention. The
 * scrim (`.marketing-hero-photo__scrim`) guarantees copy and docked-header
 * legibility regardless of the source image's brightness.
 */
export function MarketingHeroPhoto({
  src,
  width,
  height,
  opacity = 1,
  priority = true,
  className,
}: MarketingHeroPhotoProps) {
  return (
    <div
      aria-hidden='true'
      className={cn(
        'marketing-hero-photo pointer-events-none absolute inset-0 overflow-hidden',
        className
      )}
    >
      <Image
        src={src}
        alt=''
        width={width}
        height={height}
        priority={priority}
        sizes='100vw'
        quality={82}
        className='marketing-hero-photo__img size-full'
        style={{ opacity }}
      />
      <div className='marketing-hero-photo__scrim absolute inset-0' />
    </div>
  );
}
