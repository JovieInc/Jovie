import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { Logo } from '@/components/atoms/Logo';
import { Mark } from '@/lib/brand/primitives';
import { cn } from '@/lib/utils';

interface FooterBrandingProps {
  readonly artistHandle?: string;
  readonly variant?: 'light' | 'dark' | 'linear';
  readonly className?: string;
  readonly showCTA?: boolean;
  readonly size?: 'sm' | 'md';
  readonly mark?: 'wordmark' | 'icon' | 'text' | 'brand';
}

function buildUtmLink(base: string, artistHandle?: string): string {
  if (!artistHandle) return base;
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}utm_source=profile&utm_artist=${artistHandle}`;
}

function renderLogoMark(
  mark: 'wordmark' | 'icon' | 'text' | 'brand',
  size: 'sm' | 'md',
  isLinear: boolean,
  logoClass: string
): ReactNode {
  if (mark === 'icon') {
    return (
      <BrandLogo
        size={size === 'sm' ? 'chrome' : 'control'}
        tone={isLinear ? 'white' : 'auto'}
        className={logoClass}
      />
    );
  }

  if (mark === 'brand') {
    return (
      <>
        <Mark size={16} className='h-4 w-4' />
        <span>Made with Jovie</span>
      </>
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
      tone={isLinear ? 'white' : 'auto'}
      className={logoClass}
    />
  );
}

/**
 * 44x44pt minimum hit area for the logo link. Negative margins hand the extra
 * box back to layout so the visible mark and its spacing do not move.
 */
const LOGO_HIT_AREA_CLASS =
  'inline-flex min-h-11 min-w-11 items-center justify-center -mx-3 -my-2';

function getLogoLinkClass(mark: string, isLinear: boolean): string {
  if (mark === 'brand') {
    // Same brand line as the smart-link footer: 14px medium, quiet token
    // color, invisible 44px hit container.
    return 'relative inline-flex items-center gap-2 rounded-md text-sm font-medium text-secondary-token transition-colors duration-subtle hover:text-primary-token focus-ring-themed before:absolute before:left-1/2 before:top-1/2 before:h-11 before:w-full before:min-w-11 before:-translate-x-1/2 before:-translate-y-1/2';
  }
  if (mark === 'text') {
    return 'inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-md px-2 -mx-2 -my-3 focus-ring-themed text-3xs uppercase tracking-widest text-neutral-700 hover:text-neutral-950 dark:text-white/70 dark:hover:text-white';
  }
  if (isLinear) {
    return cn(
      LOGO_HIT_AREA_CLASS,
      'rounded-md focus-ring-themed transition-opacity duration-subtle ease-out hover:opacity-80'
    );
  }
  return cn(
    LOGO_HIT_AREA_CLASS,
    'rounded-md focus-ring-themed transition-colors duration-subtle ease-out hover:bg-surface-1'
  );
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
    : 'opacity-50 transition-opacity duration-subtle ease-out group-hover:opacity-100 group-focus-within:opacity-100';

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
      <Link
        href={logoHref}
        prefetch={false}
        aria-label={mark === 'brand' ? undefined : 'Jovie Home'}
        className={logoLinkClass}
      >
        {renderLogoMark(mark, size, isLinear, logoClass)}
      </Link>

      {showCTA && (
        <Link
          href={signUpLink}
          prefetch={false}
          className={cn(
            'text-3xs leading-snug uppercase font-semibold tracking-[0.04em]',
            'text-center',
            'rounded-md px-2 py-1 -mx-2 -my-1',
            !isLinear &&
              'text-neutral-700 hover:text-neutral-950 dark:text-white/70 dark:hover:text-white',
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
