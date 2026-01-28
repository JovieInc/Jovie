import Link from 'next/link';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { Logo } from '@/components/atoms/Logo';
import { cn } from '@/lib/utils';

interface FooterBrandingProps {
  artistHandle?: string;
  variant?: 'light' | 'dark';
  className?: string;
  showCTA?: boolean;
  size?: 'sm' | 'md';
  mark?: 'wordmark' | 'icon';
}

export function FooterBranding({
  artistHandle,
  variant: _variant = 'light',
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

  return (
    <div
      className={cn(
        'group flex flex-col items-center justify-center space-y-2',
        className
      )}
    >
      {mark === 'icon' ? (
        <Link
          href={logoHref}
          aria-label='Jovie home'
          className='rounded-md p-1 -m-1 focus-ring-themed opacity-50 transition-all duration-150 ease-out group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-surface-1'
        >
          <BrandLogo size={size === 'sm' ? 20 : 28} tone='auto' />
        </Link>
      ) : (
        <Link
          href={logoHref}
          aria-label='Jovie home'
          className='rounded-md p-1 -m-1 focus-ring-themed transition-all duration-150 ease-out hover:bg-surface-1'
        >
          <Logo
            size={size === 'sm' ? 'xs' : 'sm'}
            variant='wordAlt'
            className='opacity-50 transition-opacity duration-150 ease-out group-hover:opacity-100 group-focus-within:opacity-100'
          />
        </Link>
      )}

      {showCTA && (
        <Link
          href={signUpLink}
          className={cn(
            'text-[10px] leading-snug uppercase font-semibold tracking-[0.04em]',
            'text-tertiary-token hover:text-secondary-token',
            'transition-all duration-150 ease-out text-center',
            'opacity-60 group-hover:opacity-100 group-focus-within:opacity-100',
            'rounded-md px-2 py-1 -mx-2 -my-1 hover:bg-surface-1'
          )}
        >
          Join the waitlist
        </Link>
      )}
    </div>
  );
}
