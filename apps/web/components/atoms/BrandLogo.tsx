import type { CSSProperties } from 'react';
import {
  JOVIE_ICON_PATH,
  JOVIE_ICON_VIEW_BOX,
} from '@/components/atoms/jovie-icon-path';
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
  white: 'text-white',
  color: 'text-accent',
  muted: 'text-muted-foreground/50',
};

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
        viewBox={JOVIE_ICON_VIEW_BOX}
        width={size}
        height={size}
        fill='currentColor'
        role={ariaHidden ? undefined : 'img'}
        aria-label={ariaHidden ? undefined : alt}
      >
        {!ariaHidden && <title>{alt}</title>}
        <path d={JOVIE_ICON_PATH} />
      </svg>
    </span>
  );
}
