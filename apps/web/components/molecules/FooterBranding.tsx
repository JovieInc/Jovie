import Link from 'next/link';
import type { CSSProperties } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { Logo } from '@/components/atoms/Logo';
import { cn } from '@/lib/utils';

interface FooterBrandingProps {
  readonly artistHandle?: string;
  readonly variant?: 'light' | 'dark' | 'linear';
  readonly className?: string;
  readonly showCTA?: boolean;
  readonly size?: 'sm' | 'md';
  readonly mark?: 'wordmark' | 'icon';
}

export function FooterBranding({
  artistHandle,
  variant = 'light',
  className = '',
  showCTA = true,
  size = 'md',
  mark = 'wordmark',
}: FooterBrandingProps) {
  const signUpLink = artistHandle
    ? `/waitlist?utm_source=profile&utm_artist=${artistHandle}`
    : '/waitlist';

  const logoHref = artistHandle
    ? `/?utm_source=profile&utm_artist=${artistHandle}`
    : '/';

  // Linear variant: full opacity, no hover bg, cleaner look
  const isLinear = variant === 'linear';
  const logoLinkClass = isLinear
    ? 'rounded-md p-1 -m-1 focus-ring-themed transition-opacity duration-150 ease-out hover:opacity-80'
    : 'rounded-md p-1 -m-1 focus-ring-themed transition-all duration-150 ease-out hover:bg-surface-1';

  const logoClass = isLinear
    ? 'opacity-100'
    : 'opacity-50 transition-opacity duration-150 ease-out group-hover:opacity-100 group-focus-within:opacity-100';

  const ctaStyle: CSSProperties | undefined = isLinear
    ? { color: 'var(--linear-text-tertiary)' }
    : undefined;

  return (
    <div
      className={cn(
        'group flex flex-col items-center justify-center space-y-2',
        className
      )}
    >
      {mark === 'icon' ? (
        <Link href={logoHref} aria-label='Jovie home' className={logoLinkClass}>
          <BrandLogo
            size={size === 'sm' ? 20 : 28}
            tone={isLinear ? 'white' : 'auto'}
            className={logoClass}
          />
        </Link>
      ) : (
        <Link href={logoHref} aria-label='Jovie home' className={logoLinkClass}>
          <Logo
            size={size === 'sm' ? 'xs' : 'sm'}
            variant='wordAlt'
            className={logoClass}
          />
        </Link>
      )}

      {showCTA && (
        <Link
          href={signUpLink}
          className={cn(
            'text-[10px] leading-snug uppercase font-semibold tracking-[0.04em]',
            !isLinear && 'text-tertiary-token hover:text-secondary-token',
            'transition-all duration-150 ease-out text-center',
            !isLinear &&
              'opacity-60 group-hover:opacity-100 group-focus-within:opacity-100',
            'rounded-md px-2 py-1 -mx-2 -my-1',
            !isLinear && 'hover:bg-surface-1'
          )}
          style={ctaStyle}
        >
          Join the waitlist
        </Link>
      )}
    </div>
  );
}
