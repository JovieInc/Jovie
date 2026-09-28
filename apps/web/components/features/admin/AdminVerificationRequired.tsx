'use client';

import { Fingerprint } from 'lucide-react';
import { AdminStepUp } from './AdminStepUp';
import { useAdminStepUp } from './use-admin-step-up';

interface AdminVerificationRequiredProps {
  readonly message?: string;
}

/**
 * Inline state shown when an admin API returns 403 — this session is missing
 * the passkey step-up (JOV-4806). Renders the unlock action instead of a
 * generic load error or a misleading empty state, plus the step-up error so
 * a failed or hung ceremony explains itself (JOV-6892).
 */
export function AdminVerificationRequired({
  message = 'Admin verification required to load this data.',
}: AdminVerificationRequiredProps) {
  const stepUp = useAdminStepUp();

  return (
    <div
      role='status'
      className='flex flex-wrap items-center gap-2 text-app text-secondary-token'
    >
      <Fingerprint className='h-4 w-4 shrink-0' aria-hidden='true' />
      <span className='min-w-0 flex-1'>{message}</span>
      <AdminStepUp status={stepUp.status} onUnlock={stepUp.unlock} />
      {stepUp.message ? (
        <span role='alert' className='w-full text-sm text-destructive'>
          {stepUp.message}
        </span>
      ) : null}
    </div>
  );
}
