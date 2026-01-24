'use client';

import { captureException } from '@sentry/nextjs';
import { useEffect } from 'react';

export function PendingClaimRunner() {
  useEffect(() => {
    const processPendingClaims = async () => {
      try {
        // Clear any pending claims from session storage
        sessionStorage.removeItem('pendingClaim');
      } catch (error) {
        captureException(error, { extra: { context: 'pending-claim-runner' } });
      }
    };

    processPendingClaims();
  }, []);

  return null;
}
