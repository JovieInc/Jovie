'use client';

import { useState } from 'react';
import { unlockWithPasskey } from '@/lib/workspace-lock/unlock-with-passkey';

export type AdminStepUpStatus = 'idle' | 'working' | 'error';

/**
 * Runs the Touch ID / passkey step-up for admin data. First use enrolls a
 * passkey (needs a sign-in from the last 10 minutes), then signs in with it;
 * the new session carries a 12-hour admin step-up.
 */
export function useAdminStepUp() {
  const [status, setStatus] = useState<AdminStepUpStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function unlock() {
    setStatus('working');
    setMessage(null);
    try {
      await unlockWithPasskey();
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

  return { status, message, unlock };
}
