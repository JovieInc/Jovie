'use client';

import { Button } from '@jovie/ui';
import Link from 'next/link';
import { useEffect } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { track } from '@/lib/analytics';

export function ViewAnalytics({ signedIn }: Readonly<{ signedIn: boolean }>) {
  useEffect(() => {
    track('shared_view_viewed', { signedIn });
  }, [signedIn]);
  return null;
}

export function ViewSignupCard() {
  return (
    <aside
      data-testid='view-signup-card'
      className='flex flex-wrap items-center justify-between gap-3 rounded-lg border border-subtle bg-surface-1 p-4'
    >
      <p className='text-sm text-secondary-token'>
        Make views like this for your music. Jovie is free to start.
      </p>
      <div className='flex items-center gap-3'>
        <Button asChild variant='ghost' size='sm'>
          <Link href={APP_ROUTES.SIGNIN}>Sign in</Link>
        </Button>
        <Button asChild variant='primary' size='sm'>
          <Link
            href={`${APP_ROUTES.SIGNUP}?ref=view`}
            onClick={() => track('shared_view_signup_click')}
          >
            Sign up
          </Link>
        </Button>
      </div>
    </aside>
  );
}
