'use client';

import { Button } from '@jovie/ui';
import { Fingerprint } from 'lucide-react';
import { useState } from 'react';
import { authClient } from '@/lib/auth/client';

type Status = 'idle' | 'working' | 'error';

/**
 * Admin data needs a Touch ID / passkey step-up on this session. First use
 * enrolls a passkey (needs a sign-in from the last 10 minutes), then signs
 * in with it; the new session carries a 12-hour admin step-up.
 */
export function AdminStepUpBanner() {
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function unlock() {
    setStatus('working');
    setMessage(null);
    try {
      const listed = await authClient.passkey.listUserPasskeys();
      if (listed.error) throw new Error(listed.error.message);
      if ((listed.data ?? []).length === 0) {
        const added = await authClient.passkey.addPasskey({ name: 'Ovie' });
        if (added?.error) throw new Error(added.error.message);
      }
      const signedIn = await authClient.signIn.passkey();
      if (signedIn?.error) throw new Error(signedIn.error.message);
      window.location.reload();
    } catch (error) {
      setStatus('error');
      setMessage(
        error instanceof Error && error.message
          ? error.message
          : 'Passkey check did not complete.'
      );
    }
  }

  return (
    <div
      role='status'
      className='flex min-h-10 items-center gap-3 border-b border-subtle bg-surface-1 px-4 py-2 text-[13px] text-secondary-token'
    >
      <Fingerprint className='h-4 w-4 shrink-0' aria-hidden='true' />
      <span className='min-w-0 flex-1 truncate'>
        {message ??
          'Admin data is locked on this session. Unlock with Touch ID for 12 hours.'}
      </span>
      <Button
        size='sm'
        variant='secondary'
        onClick={unlock}
        disabled={status === 'working'}
      >
        {status === 'working'
          ? 'Waiting for passkey…'
          : status === 'error'
            ? 'Try again'
            : 'Unlock'}
      </Button>
    </div>
  );
}
