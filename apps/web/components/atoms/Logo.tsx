import Image from 'next/image';

import { BrandLogo, type BrandLogoTone } from '@/components/atoms/BrandLogo';
import { cn } from '@/lib/utils';

export type LogoVariant = 'word' | 'wordAlt' | 'icon' | 'full' | 'fullAlt';

interface LogoProps
  extends Readonly<{
    readonly className?: string;
    readonly size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    readonly variant?: LogoVariant;
    readonly tone?: BrandLogoTone;
    readonly priority?: boolean;
    readonly 'aria-hidden'?: boolean;
    readonly 'data-testid'?: string;
  }> {}

export function Logo({
  className,
  size = 'md',
  variant = 'word',
  tone = 'auto',
  priority = false,
  'aria-hidden': ariaHidden,
  'data-testid': dataTestId,
}: LogoProps) {
  const sizeClasses = {
    xs: 'h-4 w-auto',
    sm: 'h-6 w-auto',
    md: 'h-8 w-auto',
    lg: 'h-12 w-auto',
    xl: 'h-16 w-auto',
  };

  const iconSizePx: Record<NonNullable<LogoProps['size']>, number> = {
    xs: 16,
    sm: 20,
    md: 24,
    lg: 32,
    xl: 40,
  };

  const wordmarkWidthPx: Record<NonNullable<LogoProps['size']>, number> = {
    xs: 56,
    sm: 84,
    md: 112,
    lg: 168,
    xl: 224,
  };

  const altWordmark = (wordmarkClassName?: string, testId?: string) => {
    const imgClassName = cn(sizeClasses[size], wordmarkClassName);

    if (tone === 'auto') {
      return (
        <>
          <Image
            src='/brand/Jovie-Logo-Wordmark-Alt-Black.svg'
            alt={ariaHidden ? '' : 'Jovie logo'}
            width={136}
            height={39}
            sizes={`${wordmarkWidthPx[size]}px`}
            priority={priority}
            aria-hidden={ariaHidden}
            data-testid={testId}
            className={cn(imgClassName, 'dark:hidden')}
          />
          <Image
            src='/brand/Jovie-Logo-Wordmark-Alt-White.svg'
            alt={ariaHidden ? '' : 'Jovie logo'}
            width={136}
            height={39}
            sizes={`${wordmarkWidthPx[size]}px`}
            priority={priority}
            aria-hidden={ariaHidden}
            data-testid={testId}
            className={cn(imgClassName, 'hidden dark:block')}
          />
        </>
      );
    }

    const src =
      tone === 'white'
        ? '/brand/Jovie-Logo-Wordmark-Alt-White.svg'
        : '/brand/Jovie-Logo-Wordmark-Alt-Black.svg';

    return (
      <Image
        src={src}
        alt={ariaHidden ? '' : 'Jovie logo'}
        width={136}
        height={39}
        sizes={`${wordmarkWidthPx[size]}px`}
        priority={priority}
        aria-hidden={ariaHidden}
        data-testid={testId}
        className={imgClassName}
      />
    );
  };

  const wordmark = (wordmarkClassName?: string, testId?: string) => (
    // SVG requires role="img" for accessibility; native <img> cannot render inline SVGs
    <svg
      xmlns='http://www.w3.org/2000/svg'
      xmlnsXlink='http://www.w3.org/1999/xlink'
      viewBox='0 0 136 39'
      role='img'
      aria-hidden={ariaHidden}
      aria-label={ariaHidden ? undefined : 'Jovie logo'}
      data-testid={testId}
      className={cn(
        sizeClasses[size],
        'transition-colors duration-200',
        wordmarkClassName
      )}
      style={{ color: 'var(--linear-text-primary, currentColor)' }}
      fill='currentColor'
    >
      <path
        fillRule='evenodd'
        d='M114.928,27.260 C115.114,28.919 115.565,30.155 116.278,30.968 C117.281,32.136 118.589,32.721 120.203,32.721 C121.222,32.721 122.191,32.467 123.108,31.959 C123.669,31.637 124.272,31.70 124.917,30.257 L135.136,31.197 C133.573,33.906 131.687,35.849 129.479,37.26 C127.270,38.203 124.102,38.791 119.973,38.791 C116.389,38.791 113.568,38.287 111.513,37.280 C109.457,36.273 107.754,34.672 106.403,32.479 C105.53,30.287 104.377,27.709 104.377,24.745 C104.377,20.529 105.732,17.117 108.442,14.509 C111.152,11.902 114.893,10.598 119.668,10.598 C123.541,10.598 126.599,11.182 128.842,12.350 C131.84,13.519 132.792,15.212 133.964,17.430 C135.136,19.649 135.723,22.535 135.723,26.91 L135.723,27.260 L114.928,27.260 ZM123.554,18.14 C122.679,17.151 121.528,16.719 120.101,16.719 C118.453,16.719 117.136,17.371 116.151,18.675 C115.522,19.488 115.123,20.698 114.953,22.307 L125.172,22.307 C124.968,20.309 124.429,18.878 123.554,18.14 ZM91.811,11.207 L102.183,11.207 L102.183,38.182 L91.811,38.182 L91.811,11.207 ZM91.811,0.946 L102.183,0.946 L102.183,7.982 L91.811,7.982 L91.811,0.946 ZM70.877,38.182 L59.621,11.207 L70.413,11.207 L75.664,28.301 L81.112,11.207 L91.578,11.207 L80.76,38.182 L70.877,38.182 ZM58.459,34.816 C55.698,37.466 51.880,38.791 47.4,38.791 C42.654,38.791 39.138,37.691 36.454,35.489 C33.157,32.763 31.510,29.190 31.510,24.771 C31.510,20.656 32.903,17.265 35.689,14.598 C38.475,11.931 42.238,10.598 46.978,10.598 C52.398,10.598 56.492,12.164 59.262,15.297 C61.487,17.820 62.600,20.927 62.600,24.618 C62.600,28.767 61.220,32.166 58.459,34.816 ZM50.725,19.424 C49.756,18.281 48.558,17.710 47.131,17.710 C45.619,17.710 44.370,18.290 43.385,19.449 C42.400,20.609 41.907,22.375 41.907,24.745 C41.907,27.150 42.395,28.928 43.372,30.79 C44.349,31.231 45.577,31.806 47.55,31.806 C48.550,31.806 49.777,31.239 50.737,30.105 C51.697,28.970 52.177,27.150 52.177,24.644 C52.177,22.307 51.693,20.567 50.725,19.424 ZM24.562,36.507 C22.277,38.47 19.351,38.816 15.783,38.816 C12.11,38.816 9.89,38.309 7.17,37.293 C4.944,36.277 3.342,34.791 2.213,32.835 C1.83,30.879 0.416,28.462 0.212,25.583 L11.247,24.85 C11.264,25.727 11.408,26.947 11.680,27.742 C11.952,28.538 12.410,29.182 13.56,29.673 C13.498,29.995 14.127,30.155 14.942,30.155 C16.233,30.155 17.180,29.677 17.783,28.721 C18.386,27.766 18.688,26.154 18.688,23.887 L18.688,0.946 L30.258,0.946 L30.258,21.176 C30.258,25.423 29.880,28.655 29.124,30.872 C28.368,33.89 26.847,34.967 24.562,36.507 Z'
      />
    </svg>
  );

  if (variant === 'word') {
    return wordmark(className, dataTestId);
  }

  if (variant === 'wordAlt') {
    return altWordmark(className, dataTestId);
  }

  const icon = (
    <BrandLogo
      size={iconSizePx[size]}
      tone={tone}
      priority={priority}
      alt={ariaHidden ? '' : 'Jovie'}
      aria-hidden={ariaHidden}
      data-testid={dataTestId}
      className={variant === 'icon' ? className : undefined}
    />
  );

  if (variant === 'icon') {
    return icon;
  }

  if (variant === 'fullAlt') {
    return (
      <span
        className={cn('inline-flex items-center gap-2', className)}
        data-testid={dataTestId}
      >
        {icon}
        {altWordmark()}
      </span>
    );
  }

  return (
    <span
      className={cn('inline-flex items-center gap-2', className)}
      data-testid={dataTestId}
    >
      {icon}
      {wordmark()}
    </span>
  );
}
