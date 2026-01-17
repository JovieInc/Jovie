'use client';

import { useEffect, useRef } from 'react';
import { track } from '@/lib/analytics';

interface ProfileViewTrackerProps {
  handle: string;
  artistId: string;
  source?: string;
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

  useEffect(() => {
    // Only track once per mount
    if (hasTracked.current) return;
    hasTracked.current = true;

    track('profile_view', {
      handle,
      artist_id: artistId,
      source: source ?? (document.referrer || 'direct'),
    });
  }, [handle, artistId, source]);

  // This component renders nothing - it's purely for tracking
  return null;
}
