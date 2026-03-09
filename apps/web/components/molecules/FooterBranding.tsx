import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { Logo } from '@/components/atoms/Logo';
import { cn } from '@/lib/utils';

interface FooterBrandingProps {
  readonly artistHandle?: string;
  readonly variant?: 'light' | 'dark' | 'linear';
  readonly className?: string;
  readonly showCTA?: boolean;
  readonly size?: 'sm' | 'md';
  readonly mark?: 'wordmark' | 'icon' | 'text';
}

function buildUtmLink(base: string, artistHandle?: string): string {
  if (!artistHandle) return base;
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}utm_source=profile&utm_artist=${artistHandle}`;
}

function renderLogoMark(
  mark: 'wordmark' | 'icon' | 'text',
  size: 'sm' | 'md',
  isLinear: boolean,
  logoClass: string
): ReactNode {
  if (mark === 'icon') {
    return (
      <BrandLogo
        size={size === 'sm' ? 20 : 28}
        tone={isLinear ? 'white' : 'auto'}
        className={logoClass}
      />
    );
  }

  if (mark === 'text') {
    return (
      <>
        <span>Powered by</span>
        <span className='font-semibold'>Jovie</span>
      </>
    );
  }

  return (
    <Logo
      size={size === 'sm' ? 'xs' : 'sm'}
      variant='wordAlt'
      className={logoClass}
    />
  );
}

function getLogoLinkClass(mark: string, isLinear: boolean): string {
  if (mark === 'text') {
    return 'inline-flex items-center gap-1 rounded-md px-2 py-1 -mx-2 -my-1 focus-ring-themed text-[10px] uppercase tracking-widest text-muted-foreground/40 transition-colors duration-150 ease-out hover:text-muted-foreground';
  }
  if (isLinear) {
    return 'rounded-md p-1 -m-1 focus-ring-themed transition-opacity duration-150 ease-out hover:opacity-80';
  }
  return 'rounded-md p-1 -m-1 focus-ring-themed transition-all duration-150 ease-out hover:bg-surface-1';
}

export function FooterBranding({
  artistHandle,
  variant = 'light',
  className = '',
  showCTA = true,
  size = 'md',
  mark = 'icon',
}: FooterBrandingProps) {
  const signUpLink = buildUtmLink('/waitlist', artistHandle);
  const logoHref = buildUtmLink('/', artistHandle);

  const isLinear = variant === 'linear';
  const logoLinkClass = getLogoLinkClass(mark, isLinear);

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
      <Link href={logoHref} aria-label='Jovie home' className={logoLinkClass}>
        {renderLogoMark(mark, size, isLinear, logoClass)}
      </Link>

      {showCTA && (
        <Link
          href={signUpLink}
          className={cn(
            'text-[10px] leading-snug uppercase font-semibold tracking-[0.04em]',
            'transition-all duration-150 ease-out text-center',
            'rounded-md px-2 py-1 -mx-2 -my-1',
            !isLinear && 'text-tertiary-token hover:text-secondary-token',
            !isLinear &&
              'opacity-60 group-hover:opacity-100 group-focus-within:opacity-100',
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
