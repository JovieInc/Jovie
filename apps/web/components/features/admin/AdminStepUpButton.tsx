'use client';

import { Button } from '@jovie/ui';
import { type AdminStepUpStatus, useAdminStepUp } from './use-admin-step-up';

interface AdminStepUpButtonProps {
  /** Provide when the parent already runs useAdminStepUp. */
  readonly status?: AdminStepUpStatus;
  readonly onUnlock?: () => void;
}

/** Unlock button that runs the admin passkey step-up, then reloads. */
export function AdminStepUpButton({
  status,
  onUnlock,
}: AdminStepUpButtonProps) {
  const internal = useAdminStepUp();
  const resolvedStatus = status ?? internal.status;
  const resolvedUnlock = onUnlock ?? internal.unlock;

  return (
    <Button
      size='sm'
      variant='secondary'
      onClick={resolvedUnlock}
      disabled={resolvedStatus === 'working'}
    >
      {resolvedStatus === 'working'
        ? 'Waiting for passkey…'
        : resolvedStatus === 'error'
          ? 'Try again'
          : 'Unlock'}
    </Button>
  );
}
