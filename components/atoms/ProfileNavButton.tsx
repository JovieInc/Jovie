'use client';

import { Button } from '@jovie/ui';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface ProfileNavButtonProps {
  /** When true, shows back arrow; when false, shows Jovie icon */
  showBackButton: boolean;
  /** The artist handle for back navigation */
  artistHandle: string;
  /** Additional class names */
  className?: string;
}

/**
 * Navigation button for profile pages.
 * - On main profile: Shows Jovie icon linking to homepage
 * - On sub-pages (listen, tip, etc.): Shows animated back button
 */
export function ProfileNavButton({
  showBackButton,
  artistHandle,
  className,
}: ProfileNavButtonProps) {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);

  // Back button handler
  const handleBackClick = () => {
    if (isNavigating) return;
    setIsNavigating(true);
    router.push(`/${artistHandle}`);
  };

  // Shared button styles
  const buttonClasses = cn(
    'rounded-full relative overflow-hidden',
    'w-10 h-10 p-0 flex items-center justify-center',
    className
  );

  // Loading spinner for navigation
  if (isNavigating) {
    return (
      <Button
        className={buttonClasses}
        variant='frosted'
        aria-label='Navigating back'
        disabled
      >
        <div className='w-5 h-5 rounded-full border-2 border-gray-300 border-t-gray-700 animate-spin' />
      </Button>
    );
  }

  // Main profile: Jovie icon linking to homepage
  if (!showBackButton) {
    return (
      <Link
        href='/'
        className={cn(
          buttonClasses,
          // Frosted glass effect matching Button variant="frosted"
          'bg-white/80 dark:bg-black/60 backdrop-blur-md',
          'border border-gray-200/50 dark:border-white/10',
          'shadow-sm hover:shadow-md',
          'hover:bg-white/90 dark:hover:bg-black/70',
          'transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2'
        )}
        aria-label='Go to Jovie homepage'
      >
        <div
          className={cn(
            'w-5 h-5 flex items-center justify-center',
            'transition-all duration-300 ease-out',
            // Animate in from back button position
            'animate-in fade-in zoom-in-90 duration-300'
          )}
        >
          <Image
            src='/brand/Jovie-Logo-Icon.svg'
            alt='Jovie'
            width={20}
            height={20}
            className='w-5 h-5 object-contain'
            priority
          />
        </div>
      </Link>
    );
  }

  // Sub-page: Back button
  return (
    <Button
      className={buttonClasses}
      variant='frosted'
      aria-label='Back to profile'
      onClick={handleBackClick}
    >
      <svg
        className={cn(
          'w-5 h-5 text-gray-700 dark:text-gray-300',
          'transition-all duration-300 ease-out',
          // Animate in from Jovie icon position
          'animate-in fade-in zoom-in-90 slide-in-from-right-1 duration-300'
        )}
        fill='none'
        stroke='currentColor'
        viewBox='0 0 24 24'
      >
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          strokeWidth={2}
          d='M10 19l-7-7m0 0l7-7m-7 7h18'
        />
      </svg>
    </Button>
  );
}
