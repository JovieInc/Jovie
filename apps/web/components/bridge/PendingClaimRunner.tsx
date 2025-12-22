'use client';

import { useEffect } from 'react';

export function PendingClaimRunner() {
  useEffect(() => {
    const processPendingClaims = async () => {
      try {
        // Clear any pending claims from session storage
        sessionStorage.removeItem('pendingClaim');

        // For now, just clear the pending claim
        // In the future, this could process actual claims
        console.log('Cleared pending claims');
      } catch (error) {
        console.error('Error processing pending claims:', error);
      }
    };

    processPendingClaims();
  }, []);

  return null;
}
