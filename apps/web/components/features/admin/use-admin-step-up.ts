'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth/client';

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

  return { status, message, unlock };
}
