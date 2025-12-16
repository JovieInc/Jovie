import Link from 'next/link';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { cn } from '@/lib/utils';

interface ProfileNavButtonProps {
  /** When true, shows back arrow; when false, shows Jovie icon */
  showBackButton: boolean;
  /** The artist handle for back navigation */
  artistHandle: string;
  /** Additional class names */
  className?: string;
  /** Optional loading state to show animated spinner on the logo */
  loading?: boolean;
}

/**
 * Navigation button for profile pages.
 * - On main profile: Shows Jovie icon linking to homepage
 * - On sub-pages (listen, tip, etc.): Shows back button as Link
 */
export function ProfileNavButton({
  showBackButton,
  artistHandle,
  className,
  loading = false,
}: ProfileNavButtonProps) {
  // Shared button styles
  const buttonClasses = cn(
    'rounded-full relative overflow-hidden',
    'w-10 h-10 p-0 flex items-center justify-center',
    className
  );

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
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2',
          'transition-[opacity,transform,filter] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:opacity-90 active:scale-[0.97]'
        )}
        aria-label='Go to Jovie homepage'
      >
        <div className='relative'>
          {/* Static logo */}
          <BrandLogo size={40} tone='auto' className='w-10 h-10' priority />
          {/* Loading spinner overlay */}
          <BrandLogo
            size={40}
            tone='auto'
            alt=''
            aria-hidden
            className={cn(
              'absolute inset-0 w-10 h-10',
              'transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
              loading
                ? 'opacity-100 scale-100 animate-spin-slow'
                : 'opacity-0 scale-0 pointer-events-none'
            )}
            priority
          />
        </div>
      </Link>
    );
  }

  // Sub-page: Back button - use Link for instant navigation (no spinner needed)
  return (
    <Link
      href={`/${artistHandle}`}
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
      aria-label='Back to profile'
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
    </Link>
  );
}
