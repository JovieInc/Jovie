'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { cn } from '@/lib/utils';

interface AuthBackButtonProps {
  onClick?: () => void;
  href?: string;
  className?: string;
  ariaLabel?: string;
}

export function AuthBackButton({
  onClick,
  href,
  className,
  ariaLabel = 'Go back',
}: AuthBackButtonProps) {
  const haptic = useHapticFeedback();

  const baseClasses = cn(
    // Fixed positioning with safe area insets for notched devices
    'fixed z-50',
    'top-[max(1rem,env(safe-area-inset-top))] left-[max(1rem,env(safe-area-inset-left))]',
    'md:top-6 md:left-6',
    // Larger touch target on mobile (min 44x44)
    'inline-flex items-center justify-center rounded-full',
    'h-11 w-11 sm:h-10 sm:w-10',
    // Visual styling
    'text-primary-token bg-surface-0/80 backdrop-blur-sm',
    'border border-default',
    'shadow-sm',
    // Hover and active states
    'hover:bg-surface-1 hover:border-default',
    'active:scale-95 active:bg-surface-2',
    // Transitions
    'transition-all duration-150 ease-out',
    // Focus ring
    'focus-ring-themed',
    // Touch optimizations
    'touch-manipulation select-none',
    '[-webkit-tap-highlight-color:transparent]'
  );

  const handleClick = () => {
    haptic.light();
    onClick?.();
  };

  if (href) {
    return (
      <Link
        href={href}
        className={cn(baseClasses, className)}
        aria-label={ariaLabel}
        onClick={() => haptic.light()}
      >
        <ArrowLeft className='h-5 w-5' />
      </Link>
    );
  }

  return (
    <button
      type='button'
      onClick={handleClick}
      className={cn(baseClasses, className)}
      aria-label={ariaLabel}
    >
      <ArrowLeft className='h-5 w-5' />
    </button>
  );
}
