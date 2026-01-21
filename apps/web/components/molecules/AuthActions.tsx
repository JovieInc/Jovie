import Link from 'next/link';

export function AuthActions() {
  return (
    <div className='flex items-center gap-1'>
      {/* Login - text link style (Linear pattern) */}
      <Link
        href='/signin'
        className='inline-flex items-center justify-center h-8 px-3 text-sm font-medium text-secondary-token hover:text-primary-token transition-colors duration-150 focus-ring-themed'
      >
        Log in
      </Link>
      {/* Waitlist CTA - Linear style: 8px radius, 1px border */}
      <Link
        href='/waitlist'
        className='inline-flex items-center justify-center h-8 px-4 text-sm font-medium rounded-lg bg-btn-primary text-btn-primary-foreground border border-white/10 hover:opacity-90 transition-opacity duration-150 focus-ring-themed'
      >
        Request early access
      </Link>
    </div>
  );
}
