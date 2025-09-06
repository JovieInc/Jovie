import Link from 'next/link';
import { JovieLogo } from '@/components/atoms/JovieLogo';
import { cn } from '@/lib/utils';

interface FooterBrandingProps {
  artistHandle?: string;
  variant?: 'light' | 'dark';
  className?: string;
  showCTA?: boolean;
}

export function FooterBranding({
  artistHandle,
  variant = 'light',
  className = '',
  showCTA = true,
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
      <JovieLogo artistHandle={artistHandle} variant={variant} />

      {showCTA && (
        <Link
          href={signUpLink}
          className='text-[11px] uppercase tracking-[0.08em] text-gray-500 hover:text-indigo-500 dark:text-gray-400 dark:hover:text-indigo-400 font-medium transition-colors'
        >
          Claim your profile now
        </Link>
      )}
    </div>
  );
}
