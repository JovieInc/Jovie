// @coverage-via apps/web/tests/unit/app/public-cta-guard.test.ts
'use client';

import { Button } from '@jovie/ui';
import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';
import { useIsAuthenticated } from '@/hooks/useIsAuthenticated';

export function AuthActions() {
  const isAuthed = useIsAuthenticated();

  return (
    <div className='flex items-center gap-2'>
      {isAuthed ? (
        <Button
          asChild
          size='md'
          variant='primary'
          className='focus-ring-themed'
        >
          <Link href={APP_ROUTES.DASHBOARD}>Open App</Link>
        </Button>
      ) : (
        <>
          <Button
            asChild
            size='sm'
            variant='ghost'
            className='focus-ring-themed'
          >
            <Link href={APP_ROUTES.SIGNIN}>Log in</Link>
          </Button>
          <Button
            asChild
            size='md'
            variant='primary'
            className='focus-ring-themed'
          >
            <Link href={APP_ROUTES.SIGNUP}>Sign up</Link>
          </Button>
        </>
      )}
    </div>
  );
}
