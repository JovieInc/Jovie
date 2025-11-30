'use client';

import { Button } from '@jovie/ui';
import Link from 'next/link';

export function AuthActions() {
  return (
    <div className='flex items-center space-x-4'>
      <Link
        href='/signin'
        className='text-sm px-3 py-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 dark:focus-visible:ring-gray-500 rounded-sm'
      >
        Sign in
      </Link>
      <Button asChild variant='primary' size='default'>
        <Link href='/signup'>Sign up</Link>
      </Button>
    </div>
  );
}
