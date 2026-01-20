import Image from 'next/image';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

export type BrandLogoTone = 'auto' | 'black' | 'white' | 'color';

export interface BrandLogoProps {
  size?: number;
  className?: string;
  tone?: BrandLogoTone;
  alt?: string;
  priority?: boolean;
  rounded?: boolean;
  style?: CSSProperties;
  'aria-hidden'?: boolean;
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
    return (
      <>
        <Image
          src='/brand/Jovie-Logo-Icon-Black.svg'
          alt={alt}
          width={size}
          height={size}
          priority={priority}
          aria-hidden={ariaHidden}
          style={style}
          className={cn(baseClassName, 'dark:hidden')}
        />
        <Image
          src='/brand/Jovie-Logo-Icon-White.svg'
          alt={alt}
          width={size}
          height={size}
          priority={priority}
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
      priority={priority}
      aria-hidden={ariaHidden}
      style={style}
      className={baseClassName}
    />
  );
}
