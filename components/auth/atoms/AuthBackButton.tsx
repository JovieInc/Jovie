'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
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
  const baseClasses =
    'fixed top-4 left-4 md:top-6 md:left-6 z-50 inline-flex items-center justify-center rounded-full p-2 text-primary-token hover:bg-white/5 transition-colors focus-ring-themed';

  if (href) {
    return (
      <Link
        href={href}
        className={cn(baseClasses, className)}
        aria-label={ariaLabel}
      >
        <ArrowLeft className='h-5 w-5' />
      </Link>
    );
  }

  return (
    <button
      type='button'
      onClick={onClick}
      className={cn(baseClasses, className)}
      aria-label={ariaLabel}
    >
      <ArrowLeft className='h-5 w-5' />
    </button>
  );
}
