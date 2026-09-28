'use client';

import { Fingerprint } from 'lucide-react';
import { AdminStepUpButton } from './AdminStepUpButton';
import { useAdminStepUp } from './use-admin-step-up';

/**
 * Admin data needs a Touch ID / passkey step-up on this session. First use
 * enrolls a passkey (needs a sign-in from the last 10 minutes), then signs
 * in with it; the new session carries a 12-hour admin step-up.
 */
export function AdminStepUpBanner() {
  const { status, message, unlock } = useAdminStepUp();

  return (
    <div
      role='status'
      data-admin-step-up-banner='true'
      className='flex min-h-10 items-center gap-3 border-b border-subtle bg-surface-1 px-4 py-2 text-sm text-secondary-token'
    >
      <Fingerprint className='h-4 w-4 shrink-0' aria-hidden='true' />
      <span className='min-w-0 flex-1 truncate'>
        {message ??
          'Admin data is locked on this session. Unlock with Touch ID for 12 hours.'}
      </span>
      <AdminStepUpButton status={status} onUnlock={unlock} />
    </div>
  );
}
