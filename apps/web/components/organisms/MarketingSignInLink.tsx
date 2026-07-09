'use client';

import { Button } from '@jovie/ui';
import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';
import { cn } from '@/lib/utils';

/**
 * Marketing-header sign-in trigger. The home route group is deliberately
 * static, so auth opens through the root `@auth` intercepted route on
 * client-side navigation and falls back to the full `/signin` page on reload.
 * That keeps the page cacheable while preserving one canonical AuthShell.
 */
export function MarketingSignInLink({
  variant = 'ghost',
}: Readonly<{
  readonly variant?: 'ghost' | 'pill';
}>) {
  if (variant === 'pill') {
    return (
      <Button
        asChild
        variant='whitePill'
        className='focus-ring-themed h-9 px-4 sm:h-10 sm:px-5 sm:text-sm'
      >
        <Link href={APP_ROUTES.SIGNIN} prefetch>
          Sign in
        </Link>
      </Button>
    );
  }

  return (
    <Link
      href={APP_ROUTES.SIGNIN}
      prefetch
      className={cn(
        'focus-ring-themed',
        'text-app text-neutral-700 hover:text-neutral-950 dark:text-white/60 dark:hover:text-white/90'
      )}
    >
      Sign in
    </Link>
  );
}
