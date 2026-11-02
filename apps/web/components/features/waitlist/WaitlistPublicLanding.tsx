'use client';

import { useEffect } from 'react';
import { AuthenticatedAuthEntryGuard } from '@/components/features/auth/AuthenticatedAuthEntryGuard';
import { AuthLayout } from '@/components/features/auth/AuthLayout';
import { APP_ROUTES } from '@/constants/routes';
import {
  WAITLIST_FRONT_DOOR_CONTEXT,
  WAITLIST_FRONT_DOOR_EVENTS,
} from '@/data/homepageFrontDoorCta';
import { AuthRoutePrefetch, AuthShell } from '@/features/auth';
import { page, track } from '@/lib/analytics';
import { WaitlistRoleForm } from './WaitlistRoleForm';

/**
 * Unauthenticated /waitlist handoff (JOV-5334 / JOV-5376).
 *
 * Shared auth shell: chrome-20 mark, Continue to Jovie, email + providers.
 * Get started on marketing pages lands here instead of unfinished /start chat.
 * Auth completion continues into /start.
 *
 * With public signup closed (`PUBLIC_SIGNUP_CLOSED`, canon/PRODUCT.md
 * 2026-11-02) the same shell shows the role-qualifying waitlist form instead
 * of sign-up; returning users still reach sign-in.
 */
export function WaitlistPublicLanding({
  signupClosed = false,
}: Readonly<{ signupClosed?: boolean }> = {}) {
  useEffect(() => {
    page('waitlist', WAITLIST_FRONT_DOOR_CONTEXT);
    track(WAITLIST_FRONT_DOOR_EVENTS.PAGE_VIEW, WAITLIST_FRONT_DOOR_CONTEXT);
    track(WAITLIST_FRONT_DOOR_EVENTS.CTA_EXPOSED, WAITLIST_FRONT_DOOR_CONTEXT);
  }, []);

  return (
    <AuthenticatedAuthEntryGuard>
      <AuthLayout
        formTitle='Continue to Jovie'
        showFormTitle={false}
        showFooterPrompt={signupClosed}
        footerPrompt='Already have an account?'
        footerLinkText='Log In'
        footerLinkHref={APP_ROUTES.SIGNIN}
        layoutVariant='stack'
      >
        <AuthRoutePrefetch href={APP_ROUTES.SIGNIN} />
        {signupClosed ? (
          <WaitlistRoleForm />
        ) : (
          <AuthShell
            mode='sign-up'
            forceOppositeModeHardNavigation
            oppositeModeUrl={APP_ROUTES.SIGNIN}
            fallbackRedirectUrl={APP_ROUTES.START}
            suppressOneTap
            marketingCapture
          />
        )}
      </AuthLayout>
    </AuthenticatedAuthEntryGuard>
  );
}
