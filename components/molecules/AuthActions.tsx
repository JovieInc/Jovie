'use client';

import Link from 'next/link';

export function AuthActions() {
  return (
    <div className='flex items-center gap-2'>
      {/* Login - Geist secondary/ghost button */}
      <Link
        href='/signin'
        className='inline-flex items-center justify-center h-8 px-3 text-sm font-medium rounded-md text-neutral-200 bg-neutral-900 hover:bg-neutral-800 shadow-[0_0_0_1px_#2e2e2e] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black focus-visible:ring-white/50'
        style={{ fontSynthesisWeight: 'none' }}
      >
        Log in
      </Link>
      {/* Sign up - Geist primary button */}
      <Link
        href='/waitlist'
        className='inline-flex items-center justify-center h-8 px-3 text-sm font-medium rounded-md bg-white text-black hover:bg-neutral-200 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black focus-visible:ring-white/50'
        style={{ fontSynthesisWeight: 'none' }}
      >
        Sign up
      </Link>
    </div>
  );
}
