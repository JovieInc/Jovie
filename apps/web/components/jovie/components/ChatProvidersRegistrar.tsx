'use client';

import { useEffect, useMemo } from 'react';
import { registerEntityProvider } from '@/lib/commands/entities';
import { artistProvider } from './artist-provider';
import { createReleaseProvider } from './release-provider';

/**
 * Registers the EntityProviders for downstream cmd+k / non-chat surfaces.
 *
 * The chat composer's slash picker no longer reads from this registry —
 * it calls `useReleasesQuery` / `useArtistSearchQuery` directly so hook
 * order is stable from the very first render. This component still exists
 * because the broader command palette (JOV-1792) does need the registry.
 */
export function ChatProvidersRegistrar({
  profileId,
}: {
  readonly profileId: string;
}) {
  const releaseProvider = useMemo(
    () => createReleaseProvider(profileId),
    [profileId]
  );

  useEffect(() => {
    registerEntityProvider(releaseProvider);
    registerEntityProvider(artistProvider);
  }, [releaseProvider]);

  return null;
}
