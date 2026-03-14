'use client';

import { useEffect, useRef } from 'react';
import { track } from '@/lib/analytics';
import { useTrackingMutation } from '@/lib/queries';

interface ProfileViewTrackerProps {
  readonly handle: string;
  readonly artistId: string;
  readonly source?: string;
}

/**
 * Client component that tracks profile_view analytics event on mount.
 * This is rendered on the profile page to capture client-side analytics
 * while the server component handles the database view counter.
 */
export function ProfileViewTracker({
  handle,
  artistId,
  source,
}: ProfileViewTrackerProps) {
  const hasTracked = useRef(false);
  const trackView = useTrackingMutation<{ handle: string }>({
    endpoint: '/api/profile/view',
  });

  useEffect(() => {
    // Only track once per mount
    if (hasTracked.current) return;
    hasTracked.current = true;

    track('profile_view', {
      handle,
      artist_id: artistId,
      source: source ?? (document.referrer || 'direct'),
    });

    const body = JSON.stringify({ handle });
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      const sent = navigator.sendBeacon('/api/profile/view', blob);
      if (sent) return;
    }

    trackView.mutate({ handle });
  }, [handle, artistId, source, trackView]);

  // This component renders nothing - it's purely for tracking
  return null;
}
