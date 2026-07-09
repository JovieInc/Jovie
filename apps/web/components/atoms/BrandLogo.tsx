import type { CSSProperties } from 'react';
import { JOVIE_PATH, JOVIE_VIEWBOX } from '@/lib/brand/tokens';
import { cn } from '@/lib/utils';

export type BrandLogoTone = 'auto' | 'white' | 'color' | 'muted';

export interface BrandLogoProps {
  readonly size?: number;
  readonly className?: string;
  readonly tone?: BrandLogoTone;
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

const BRAND_VIEW_BOX = `0 0 ${JOVIE_VIEWBOX.width} ${JOVIE_VIEWBOX.height}`;

export function BrandLogo({
  size = 48,
  className,
  tone = 'auto',
  alt = 'Jovie',
  rounded = true,
  style,
  'aria-hidden': ariaHidden,
}: BrandLogoProps) {
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
    >
      <svg
        xmlns='http://www.w3.org/2000/svg'
        viewBox={BRAND_VIEW_BOX}
        width={size}
        height={size}
        fill='currentColor'
        shapeRendering='geometricPrecision'
        role={ariaHidden ? undefined : 'img'}
        aria-label={ariaHidden ? undefined : alt}
      >
        {!ariaHidden && <title>{alt}</title>}
        <path d={JOVIE_PATH} />
      </svg>
    </span>
  );
}
