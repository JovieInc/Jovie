'use client';

import { AuthLayout } from '@/components/auth';

export function WaitlistSuccessView() {
  return (
    <AuthLayout
      formTitle="You're on the waitlist!"
      showLogo={false}
      showFooterPrompt={false}
      showLogoutButton
      logoutRedirectUrl='/sign-in'
      formTitleClassName='text-lg font-medium text-primary-token mb-4 text-center'
    >
      <p className='text-sm text-secondary-token text-center'>
        Early access is rolling out in stages.
      </p>
    </AuthLayout>
  );
}
