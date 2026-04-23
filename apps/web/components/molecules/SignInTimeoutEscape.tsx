'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect, useState } from 'react';

const SIGNIN_TIMEOUT_MS = 6_000;

/**
 * Client-only escape hatch for the signin skeleton loop. If Clerk's
 * `<SignIn />` component doesn't mount and render a form within
 * SIGNIN_TIMEOUT_MS, we reveal a link to `/api/auth/reset` so the user
 * can clear stale cookies and retry without needing dev tools.
 *
 * Fires a single Sentry breadcrumb when the timeout triggers so we can
 * measure how often users hit this state even when Clerk eventually loads.
 */
export function SignInTimeoutEscape() {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      // If Clerk's SignIn form is already in the DOM, stay silent — no
      // reason to offer an escape when signin is working.
      const clerkFormMounted = Boolean(
        document.querySelector(
          '[data-clerk-component="SignIn"], .cl-signIn-root, .cl-rootBox'
        )
      );
      if (clerkFormMounted) return;

      setTimedOut(true);
      Sentry.captureMessage('clerk_signin_skeleton_timeout', {
        level: 'warning',
        tags: {
          hostname: globalThis.location?.hostname ?? 'unknown',
          reset_param: new URLSearchParams(globalThis.location?.search).has(
            'reset'
          )
            ? '1'
            : '0',
        },
      });
    }, SIGNIN_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, []);

  if (!timedOut) return null;

  return (
    <div className='mt-6 text-center text-sm text-[var(--color-text-tertiary-token)]'>
      Having trouble?{' '}
      {/* API route, not a page — intentional full-document navigation so the
          server can clear cookies and 303 to /signin?reset=1. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href='/api/auth/reset'
        className='underline font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
      >
        Reset session and retry &rarr;
      </a>
    </div>
  );
}
