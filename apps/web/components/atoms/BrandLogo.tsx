import type { CSSProperties } from 'react';
import {
  BRAND_WORDMARKS,
  type BrandMarkSize,
  type BrandVariant,
  jovieMarkAtSize,
  resolveBrandMarkSize,
} from '@/lib/brand/tokens';
import { cn } from '@/lib/utils';

export type BrandLogoTone = 'auto' | 'white' | 'color' | 'muted';

export interface BrandLogoProps {
  readonly size?: BrandMarkSize;
  readonly className?: string;
  readonly tone?: BrandLogoTone;
  readonly variant?: BrandVariant;
  readonly alt?: string;
  readonly rounded?: boolean;
  readonly style?: CSSProperties;
  readonly 'aria-hidden'?: boolean;
}

const TONE_CLASSES: Record<BrandLogoTone, string | undefined> = {
  auto: undefined,
  white: 'text-white dark:text-white',
  color: 'text-accent',
  muted: 'text-muted-foreground/50',
};

export function BrandLogo({
  size = 'chrome',
  className,
  tone = 'auto',
  variant = 'jovie',
  alt,
  rounded = true,
  style,
  'aria-hidden': ariaHidden,
}: BrandLogoProps) {
  const resolvedAlt = alt ?? BRAND_WORDMARKS[variant];
  const markSize = resolveBrandMarkSize(size);
  // Both variants draw the same O in a square slot; the pixel master for the
  // size keeps the seam and counter crisp at 16-32 px.
  const mark = jovieMarkAtSize(markSize);
  return (
    <span
      className={cn(
        'inline-flex shrink-0 overflow-hidden',
        rounded ? 'rounded-full' : undefined,
        TONE_CLASSES[tone],
        className
      )}
      style={style}
      aria-hidden={ariaHidden}
      data-brand-variant={variant}
      data-brand-mark-size={markSize}
    >
      <svg
        xmlns='http://www.w3.org/2000/svg'
        viewBox={mark.viewBox}
        width={markSize}
        height={markSize}
        fill='currentColor'
        shapeRendering='geometricPrecision'
        role={ariaHidden ? undefined : 'img'}
        aria-label={ariaHidden ? undefined : resolvedAlt}
      >
        {!ariaHidden && <title>{resolvedAlt}</title>}
        <path d={mark.d} />
      </svg>
    </span>
  );
}
