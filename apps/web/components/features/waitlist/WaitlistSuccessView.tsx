'use client';

import { APP_ROUTES } from '@/constants/routes';
import { AuthLayout } from '@/features/auth';

export function WaitlistSuccessView() {
  return (
    <AuthLayout
      formTitle="You're on the waitlist!"
      showLogo={false}
      showFooterPrompt={false}
      showLogoutButton
      logoutRedirectUrl={APP_ROUTES.SIGNIN}
      formTitleClassName='text-lg font-medium text-primary-token mb-4 text-center'
    >
      <p className='text-sm text-secondary-token text-center'>
        Early access is rolling out in stages.
      </p>
    </AuthLayout>
  );
}
