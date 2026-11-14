/**
 * App-mode system-prompt assembly for one chat turn, extracted from run.ts
 * (whole-file size ratchet). Owns the release-catalog threading: the prompt
 * gets the catalog meta (total/unavailable) and `@release:` tokens missing
 * from the loaded slice are resolved through the ownership-scoped query so
 * beyond-slice references hydrate instead of rendering as unsupported
 * (dogfood 2026-11-10, Astra review).
 */

import type { ChatAccountContext } from '@/lib/chat/account-context';
import {
  resolveNamedOwnedReleasesForPrompt,
  resolveOwnedReleaseTokensForHydration,
} from '@/lib/chat/catalog-query';
import { buildReferencedEntitiesBlock } from '@/lib/chat/entity-hydration';
import {
  buildPinnedOpportunityBlock,
  type PinnedOpportunityContext,
} from '@/lib/chat/pinned-opportunity';
import { captureError } from '@/lib/error-tracking';
import {
  applyEveIdentityToSystemPrompt,
  type EveIdentityId,
} from '@/lib/ovie/identity';
import {
  buildSystemPromptParts,
  type SystemPromptParts,
} from './system-prompt';
import type {
  ArtistContext,
  ReleaseCatalogMeta,
  ReleaseCatalogStatus,
  ReleaseContext,
} from './types';

async function namedReleasesForTurn(
  releases: readonly ReleaseContext[],
  userTexts: readonly string[],
  profileId: string | null,
  status: ReleaseCatalogStatus | undefined
): Promise<ReleaseContext[]> {
  if (status === 'unavailable') return [];
  try {
    return await resolveNamedOwnedReleasesForPrompt(
      releases,
      userTexts,
      profileId
    );
  } catch (error) {
    try {
      await captureError('Named release lookup failed', error, {
        feature: 'chat-named-release',
        profileId,
      });
    } catch {
      // Observability must not fail a turn whose catalog read already succeeded.
    }
    return [];
  }
}

export interface AssembleAppPromptInput {
  readonly artistContext: ArtistContext;
  readonly releases: ReleaseContext[];
  /** Catalog read health + total; omitted = loaded slice is the whole catalog. */
  readonly releaseCatalog?: ReleaseCatalogMeta;
  /** Internal creator-profile UUID; null = no owned-catalog fallback. */
  readonly profileId: string | null;
  /** Recent user turn texts, most-recent first (token carriers). */
  readonly userTexts: readonly string[];
  readonly aiCanUseTools: boolean;
  readonly aiWeeklyMessageLimit: number;
  readonly insightsEnabled: boolean;
  readonly knowledgeContext: string;
  readonly pinnedOpportunity?: PinnedOpportunityContext | null;
  readonly identity?: {
    readonly id: EveIdentityId;
    readonly instructions: string;
  };
  readonly lockedTools?: readonly {
    readonly name: string;
    readonly label: string;
    readonly planRequired: string;
  }[];
  readonly accountContext?: ChatAccountContext;
}

export async function assembleAppModeSystemPrompt(
  input: AssembleAppPromptInput
): Promise<SystemPromptParts> {
  const {
    artistContext,
    releases,
    profileId,
    userTexts,
    knowledgeContext,
    identity,
  } = input;

  const beyondSlice = await resolveOwnedReleaseTokensForHydration(
    releases,
    userTexts,
    profileId
  );
  const namedReleases = await namedReleasesForTurn(
    releases,
    userTexts,
    profileId,
    input.releaseCatalog?.status
  );
  const referencedEntities = buildReferencedEntitiesBlock({
    userTexts,
    ownedReleases: [...releases, ...beyondSlice],
    artist: {
      displayName: artistContext.displayName,
      username: artistContext.username,
      spotifyUrl: artistContext.spotifyUrl,
    },
    ownProfileId: profileId,
  });
  const pinnedOpportunityBlock = buildPinnedOpportunityBlock(
    input.pinnedOpportunity
  );
  const parts = buildSystemPromptParts(artistContext, releases, {
    aiCanUseTools: input.aiCanUseTools,
    aiWeeklyMessageLimit: input.aiWeeklyMessageLimit,
    insightsEnabled: input.insightsEnabled,
    knowledgeContext: knowledgeContext || undefined,
    accountContext: input.accountContext,
    referencedEntities,
    pinnedOpportunity: pinnedOpportunityBlock,
    lockedTools: input.lockedTools,
    releaseCatalog: input.releaseCatalog ?? {
      status: 'ok',
      total: releases.length,
    },
    namedReleases,
  });
  return identity
    ? {
        stable: applyEveIdentityToSystemPrompt(parts.stable, identity),
        dynamic: parts.dynamic,
      }
    : parts;
}
