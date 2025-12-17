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
        'flex flex-col items-center justify-center space-y-1.5',
        className
      )}
    >
      {mark === 'icon' ? (
        <Link
          href={logoHref}
          aria-label='Jovie home'
          className='rounded-sm focus-ring-themed'
        >
          <BrandLogo size={size === 'sm' ? 20 : 24} tone='auto' />
        </Link>
      ) : (
        <Link
          href={logoHref}
          aria-label='Jovie home'
          className='rounded-sm focus-ring-themed'
        >
          <Logo size={size === 'sm' ? 'xs' : 'sm'} variant='wordAlt' />
        </Link>
      )}

      {showCTA && (
        <Link
          href={signUpLink}
          className='text-[10px] leading-snug uppercase tracking-[0.08em] text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 font-medium transition-colors text-center'
        >
          Join the waitlist
        </Link>
      )}
    </div>
  );
}
