'use client';

import Link from 'next/link';

export function AuthActions() {
  return (
    <div className='flex items-center gap-2'>
      {/* Login - Linear secondary button */}
      <Link
        href='/signin'
        className='inline-flex items-center justify-center h-8 px-3 text-[.875rem] leading-[1.5] tracking-[-.013em] font-normal rounded-md text-secondary-token hover:text-primary-token hover:bg-surface-1 transition-colors duration-150 focus-ring-themed select-none whitespace-nowrap'
      >
        Log in
      </Link>
      {/* Sign up - Linear primary button */}
      <Link
        href='/waitlist'
        className='inline-flex items-center justify-center h-8 px-3 text-[.875rem] leading-[1.5] tracking-[-.013em] font-normal rounded-md bg-btn-primary text-btn-primary-foreground hover:bg-btn-primary/90 transition-colors duration-150 focus-ring-themed select-none whitespace-nowrap'
      >
        Request early access
      </Link>
    </div>
  );
}
