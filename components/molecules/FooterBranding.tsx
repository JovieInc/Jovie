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
  variant = 'light',
  className = '',
  showCTA = true,
  size = 'md',
  mark = 'wordmark',
}: FooterBrandingProps) {
  void variant;
  const signUpLink = artistHandle
    ? `/waitlist?utm_source=profile&utm_artist=${artistHandle}`
    : '/waitlist';

  const logoHref = artistHandle
    ? `/?utm_source=profile&utm_artist=${artistHandle}`
    : '/';

  return (
    <div
      className={cn(
        'group flex flex-col items-center justify-center space-y-1.5',
        className
      )}
    >
      {mark === 'icon' ? (
        <Link
          href={logoHref}
          aria-label='Jovie home'
          className='rounded-sm focus-ring-themed opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100'
        >
          <BrandLogo size={size === 'sm' ? 20 : 24} tone='auto' />
        </Link>
      ) : (
        <Link
          href={logoHref}
          aria-label='Jovie home'
          className='rounded-sm focus-ring-themed opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100'
        >
          <Logo
            size={size === 'sm' ? 'xs' : 'sm'}
            variant='wordAlt'
            className='opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100'
          />
        </Link>
      )}

      {showCTA && (
        <Link
          href={signUpLink}
          className='text-[10px] leading-snug uppercase font-medium tracking-tight text-gray-400 dark:text-gray-500 transition-[color,opacity] text-center opacity-60 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-gray-600 dark:hover:text-gray-300'
        >
          Join the waitlist
        </Link>
      )}
    </div>
  );
}
