import Link from 'next/link';
import { JovieLogo } from '@/components/atoms/JovieLogo';
import { cn } from '@/lib/utils';

interface FooterBrandingProps {
  artistHandle?: string;
  variant?: 'light' | 'dark';
  className?: string;
  showCTA?: boolean;
  size?: 'sm' | 'md';
}

export function FooterBranding({
  artistHandle,
  variant = 'light',
  className = '',
  showCTA = true,
  size = 'md',
}: FooterBrandingProps) {
  const signUpLink = artistHandle
    ? `/sign-up?utm_source=profile&utm_artist=${artistHandle}`
    : '/sign-up';

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center space-y-1.5',
        className
      )}
    >
      <JovieLogo artistHandle={artistHandle} variant={variant} size={size} />

      {showCTA && (
        <Link
          href={signUpLink}
          className='text-[10px] leading-snug uppercase tracking-[0.08em] text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 font-medium transition-colors text-center'
        >
          Claim your profile now
        </Link>
      )}
    </div>
  );
}
