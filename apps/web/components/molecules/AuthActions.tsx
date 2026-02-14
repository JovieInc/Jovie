'use client';

import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';
import { useIsAuthenticated } from '@/hooks/useIsAuthenticated';

export function AuthActions() {
  const isAuthed = useIsAuthenticated();

  return (
    <div className='flex items-center gap-1'>
      {isAuthed ? (
        <Link
          href={APP_ROUTES.DASHBOARD}
          className='btn-linear-signup focus-ring-themed'
        >
          Open App
        </Link>
      ) : (
        <>
          {/* Login - Linear exact specs via CSS class */}
          <Link href='/signin' className='btn-linear-login focus-ring-themed'>
            Log in
          </Link>
          {/* Signup - Linear exact specs via CSS class */}
          <Link
            href='/signup'
            className='btn-linear-signup focus-ring-themed'
          >
            Sign up
          </Link>
        </>
      )}
    </div>
  );
}
