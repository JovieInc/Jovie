'use client';

import { getLinearPillClassName } from '@jovie/ui';
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
          className={getLinearPillClassName({ className: 'focus-ring-themed' })}
        >
          Open App
        </Link>
      ) : (
        <>
          {/* Login - Linear exact specs via CSS class */}
          <Link
            href={APP_ROUTES.SIGNIN}
            className='btn-linear-login focus-ring-themed'
          >
            Log in
          </Link>
          {/* Signup - Linear exact specs via CSS class */}
          <Link
            href={APP_ROUTES.SIGNUP}
            className={getLinearPillClassName({
              className: 'focus-ring-themed',
            })}
          >
            Sign up
          </Link>
        </>
      )}
    </div>
  );
}
