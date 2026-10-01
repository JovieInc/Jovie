'use client';

import { Button } from '@jovie/ui';
import { useState } from 'react';
import { AuthLayout } from '@/features/auth';
import { unlockWithPasskey } from '@/lib/workspace-lock/unlock-with-passkey';

export function OvieConnectVerification({
  authorizePath,
  purpose,
}: {
  readonly authorizePath: string;
  readonly purpose: 'admin' | 'privacy';
}) {
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function verify() {
    setWorking(true);
    setMessage(null);
    try {
      await unlockWithPasskey({ purpose, allowEnrollment: false });
      // The server repeats all authorization checks on the completing session.
      window.location.assign(authorizePath);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Verification failed. Try again.'
      );
      setWorking(false);
    }
  }

  return (
    <AuthLayout
      formTitle='Connect Ovie'
      showFooterPrompt={false}
      layoutVariant='stack'
    >
      <div className='flex flex-col gap-4'>
        <p className='text-sm text-secondary-token'>
          {purpose === 'privacy'
            ? 'Unlock Ovie with your passkey to finish connecting.'
            : 'Verify your passkey to finish connecting Ovie.'}
        </p>
        <Button
          type='button'
          variant='primary'
          disabled={working}
          onClick={verify}
        >
          {working ? 'Waiting for passkey…' : 'Verify with passkey'}
        </Button>
        <p
          role={message ? 'alert' : 'status'}
          aria-live='polite'
          className='min-h-16 text-sm text-secondary-token'
        >
          {message}
        </p>
      </div>
    </AuthLayout>
  );
}
