'use client';

import { Button } from '@jovie/ui';
import Link from 'next/link';

export function AuthActions() {
  return (
    <div className='flex items-center space-x-4'>
      <Link
        href='/signin'
        className='text-sm px-4 py-2 min-h-[44px] text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 dark:focus-visible:ring-gray-500 rounded-md'
      >
        Sign in
      </Link>
      <Button
        asChild
        variant='primary'
        size='lg'
        className='!h-[52px] !px-6 font-semibold tracking-wide shadow-[0_12px_30px_rgba(15,23,42,0.25)]'
      >
        <Link href='/signup'>Sign up</Link>
      </Button>
    </div>
  );
}
