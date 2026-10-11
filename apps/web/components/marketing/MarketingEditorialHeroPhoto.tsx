import Image from 'next/image';
import './MarketingEditorialHeroPhoto.css';

export interface MarketingEditorialHeroPhotoProps {
  /** Public path to the optimized (webp/avif) hero image under /public. */
  readonly src: string;
  /** Rendered opacity of the photo over the dark underlay (0-1). */
  readonly opacity: number;
  readonly testId?: string;
}

/**
 * Full-bleed editorial hero background photo (marketing routes spec,
 * 2026-09-26). A dark underlay + low-opacity photo + a top scrim keep the
 * docked, no-background `MarketingHeader` legible over imagery — the
 * "calm image area / lower opacity / subtle top scrim" contract.
 *
 * Purely decorative: `alt=''` plus `aria-hidden` keep it out of the
 * accessibility tree. Pair with `.marketing-hero-dock` on the section
 * wrapper so the image bleeds to y=0 under the fixed header.
 */
export function MarketingEditorialHeroPhoto({
  src,
  opacity,
  testId,
}: Readonly<MarketingEditorialHeroPhotoProps>) {
  return (
    <div
      aria-hidden='true'
      data-testid={testId}
      className='marketing-editorial-hero-photo'
    >
      <Image
        src={src}
        alt=''
        fill
        priority
        sizes='100vw'
        quality={82}
        className='marketing-editorial-hero-photo__img'
        style={{ opacity }}
      />
      <div className='marketing-editorial-hero-photo__scrim' />
    </div>
  );
}
