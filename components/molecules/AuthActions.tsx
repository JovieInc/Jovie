'use client';

import { Button } from '@jovie/ui';
import Link from 'next/link';

export function AuthActions() {
  return (
    <div className='flex items-center gap-2'>
      {/* Login - Geist secondary/ghost button */}
      <Button
        asChild
        size='sm'
        variant='ghost'
        className='text-secondary-token hover:text-primary-token'
      >
        <Link href='/signin'>Log in</Link>
      </Button>
      {/* Sign up - Geist primary button */}
      <Button asChild size='sm' variant='primary'>
        <Link href='/waitlist'>Request early access</Link>
      </Button>
    </div>
  );
}
