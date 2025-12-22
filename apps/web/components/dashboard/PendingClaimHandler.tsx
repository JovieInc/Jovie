'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function PendingClaimHandler() {
  const router = useRouter();

  useEffect(() => {
    // Check for pending claims and redirect if needed
    // Guard against SSR where sessionStorage is not available
    if (typeof window === 'undefined') {
      return;
    }

    const pendingClaim = sessionStorage.getItem('pendingClaim');
    const selectedArtist = sessionStorage.getItem('selectedArtist');

    if (pendingClaim && !selectedArtist) {
      // User has a pending claim but hasn't selected an artist yet
      router.push('/artist-selection');
    }
  }, [router]);

  return null; // This component renders nothing
}
