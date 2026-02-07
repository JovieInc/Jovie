'use client';

import { useEffect, useRef } from 'react';
import { useAuthSafe } from '@/hooks/useClerkSafe';
import { track } from '@/lib/analytics';

interface ProfileViewTrackerProps {
  readonly handle: string;
  readonly artistId: string;
  readonly source?: string;
  /** Clerk user ID of the profile owner; when the viewer matches, skip view counting. */
  readonly ownerClerkId?: string | null;
}

/**
 * Client component that tracks profile_view analytics event on mount.
 * This is rendered on the profile page to capture client-side analytics
 * while the server component handles the database view counter.
 * Skips tracking when the viewer is the profile owner to prevent self-inflation.
 */
export function ProfileViewTracker({
  handle,
  artistId,
  source,
  ownerClerkId,
}: ProfileViewTrackerProps) {
  const hasTracked = useRef(false);
  const { userId } = useAuthSafe();

  useEffect(() => {
    // Only track once per mount
    if (hasTracked.current) return;
    hasTracked.current = true;

    // Skip view counting when the profile owner views their own profile
    const isOwner = ownerClerkId && userId && ownerClerkId === userId;

    track('profile_view', {
      handle,
      artist_id: artistId,
      source: source ?? (document.referrer || 'direct'),
    });

    // Don't inflate view count for owner self-views
    if (isOwner) return;

    const body = JSON.stringify({ handle });
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      const sent = navigator.sendBeacon('/api/profile/view', blob);
      if (sent) return;
    }

    fetch('/api/profile/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      // Ignore tracking errors
    });
  }, [handle, artistId, source, ownerClerkId, userId]);

  // This component renders nothing - it's purely for tracking
  return null;
}
