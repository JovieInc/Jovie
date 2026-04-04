'use client';

import { APP_ROUTES } from '@/constants/routes';
import { AuthLayout } from '@/features/auth';
import { AUTH_SURFACE, FORM_LAYOUT } from '@/lib/auth/constants';
import { cn } from '@/lib/utils';

export function WaitlistSuccessView() {
  return (
    <AuthLayout
      formTitle="You're on the waitlist!"
      showLogo={false}
      showFooterPrompt={false}
      showLogoutButton
      logoutRedirectUrl={APP_ROUTES.SIGNIN}
    >
      <div className={cn('w-full px-6 py-7 text-center', AUTH_SURFACE.card)}>
        <p className={cn(FORM_LAYOUT.hint, 'mt-0')}>
          Early access is rolling out in stages.
        </p>
      </div>
    </AuthLayout>
  );
}
