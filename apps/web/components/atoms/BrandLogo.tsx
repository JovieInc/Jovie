import Image from 'next/image';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

export type BrandLogoTone = 'auto' | 'black' | 'white' | 'color';

export interface BrandLogoProps {
  readonly size?: number;
  readonly className?: string;
  readonly tone?: BrandLogoTone;
  readonly alt?: string;
  readonly priority?: boolean;
  readonly rounded?: boolean;
  readonly style?: CSSProperties;
  readonly 'aria-hidden'?: boolean;
}

export function BrandLogo({
  size = 48,
  className,
  tone = 'auto',
  alt = 'Jovie',
  priority = false,
  rounded = true,
  style,
  'aria-hidden': ariaHidden,
}: BrandLogoProps) {
  const baseClassName = cn(rounded ? 'rounded-full' : undefined, className);

  if (tone === 'auto') {
    // When both theme variants are rendered, avoid using `priority` (which adds
    // <link rel="preload">) because only one variant is visible at a time and
    // the hidden one triggers a browser warning about unused preloaded resources.
    // Instead, use loading="eager" + fetchPriority="high" for the same effect.
    const loadingProp = priority ? ('eager' as const) : ('lazy' as const);
    const fetchPriorityProp = priority ? ('high' as const) : undefined;

    return (
      <>
        <Image
          src='/brand/Jovie-Logo-Icon-Black.svg'
          alt={alt}
          width={size}
          height={size}
          sizes={`${size}px`}
          loading={loadingProp}
          fetchPriority={fetchPriorityProp}
          aria-hidden={ariaHidden}
          style={style}
          className={cn(baseClassName, 'dark:hidden')}
        />
        <Image
          src='/brand/Jovie-Logo-Icon-White.svg'
          alt={alt}
          width={size}
          height={size}
          sizes={`${size}px`}
          loading={loadingProp}
          fetchPriority={fetchPriorityProp}
          aria-hidden={ariaHidden}
          style={style}
          className={cn(baseClassName, 'hidden dark:block')}
        />
      </>
    );
  }

  const TONE_SRC_MAP: Record<BrandLogoTone, string> = {
    white: '/brand/Jovie-Logo-Icon-White.svg',
    black: '/brand/Jovie-Logo-Icon-Black.svg',
    color: '/brand/Jovie-Logo-Icon.svg',
    auto: '/brand/Jovie-Logo-Icon.svg',
  };
  const src = TONE_SRC_MAP[tone];

  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      sizes={`${size}px`}
      priority={priority}
      aria-hidden={ariaHidden}
      style={style}
      className={baseClassName}
    />
  );
}
