'use client';

import { Fingerprint } from 'lucide-react';
import { AdminStepUpButton } from './AdminStepUpButton';

interface AdminVerificationRequiredProps {
  readonly message?: string;
}

/**
 * Inline state shown when an admin API returns 403 — this session is missing
 * the passkey step-up (JOV-4806). Renders the unlock action instead of a
 * generic load error or a misleading empty state.
 */
export function AdminVerificationRequired({
  message = 'Admin verification required to load this data.',
}: AdminVerificationRequiredProps) {
  return (
    <div
      role='status'
      className='flex flex-wrap items-center gap-2 text-app text-secondary-token'
    >
      <Fingerprint className='h-4 w-4 shrink-0' aria-hidden='true' />
      <span className='min-w-0 flex-1'>{message}</span>
      <AdminStepUpButton />
    </div>
  );
}
