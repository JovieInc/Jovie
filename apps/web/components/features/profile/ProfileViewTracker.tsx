'use client';

import { useEffect, useRef } from 'react';
import { track } from '@/lib/analytics';
import { useTrackingMutation } from '@/lib/queries';
import { postJsonBeacon } from '@/lib/tracking/json-beacon';

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
  const trackViewRef = useRef(trackView);
  useEffect(() => {
    trackViewRef.current = trackView;
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

    const sent = postJsonBeacon('/api/profile/view', { handle });
    if (sent) return;

    trackViewRef.current.mutate({ handle });
  }, [handle, artistId, source]);

  // This component renders nothing - it's purely for tracking
  return null;
}
