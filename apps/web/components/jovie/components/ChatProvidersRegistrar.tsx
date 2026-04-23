'use client';

import { useEffect, useMemo } from 'react';
import { registerEntityProvider } from '@/lib/commands/entities';
import { artistProvider } from './artist-provider';
import { createReleaseProvider } from './release-provider';

/**
 * Registers the EntityProviders for chat / command surfaces.
 *
 * Must be mounted exactly once inside the Jovie chat container (somewhere
 * above `ChatInput` and `SlashCommandMenu`). The registry throws on duplicate
 * registration, so rendering this twice in one tree is a wiring bug, not a
 * runtime nicety — verified by `apps/web/lib/commands/entities.ts` throw.
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
