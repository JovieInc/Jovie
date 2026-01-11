import Link from 'next/link';

export function AuthActions() {
  return (
    <div className='flex items-center gap-3 sm:gap-2'>
      {/* Login - Geist secondary/ghost button */}
      <Link
        href='/signin'
        className='inline-flex items-center justify-center h-9 min-h-[44px] px-3 sm:px-4 text-sm font-medium rounded-md text-secondary-token hover:text-primary-token hover:bg-surface-1 transition-colors duration-150 focus-ring-themed'
      >
        Log in
      </Link>
      {/* Sign up - Geist primary button */}
      <Link
        href='/waitlist'
        className='inline-flex items-center justify-center h-9 min-h-[44px] px-3 sm:px-4 text-sm font-medium rounded-md bg-btn-primary text-btn-primary-foreground hover:bg-btn-primary/90 transition-colors duration-150 focus-ring-themed'
      >
        Request early access
      </Link>
    </div>
  );
}
