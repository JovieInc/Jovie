/**
 * Authority page gap detector (GH #14651 / parent #14650).
 *
 * When a claimed artist is mentioned in peer graphs without a link (or simply
 * lacks Genius / Fandom / Wikipedia surfaces), emit a suggested_actions card
 * that offers to draft a page from Jovie claimed-graph context.
 *
 * Publish path:
 * - Fandom / Genius: agent-assisted draft + human confirm
 * - Wikipedia: draft only, human-gated (never auto-publish)
 */

import { eq } from 'drizzle-orm';
import {
  AUTHORITY_PLATFORM_META,
  type AuthorityPagePlatform,
  type ClaimedGraphContext,
  isAuthorityPagePlatform,
} from '@/lib/authority';
import { db } from '@/lib/db';
import { suggestedActions } from '@/lib/db/schema/connectors';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

export const AUTHORITY_CREATE_PAGE_KIND = 'authority.create_page' as const;

/** Platforms product surfaces first (lower bar before Wikipedia). */
export const DEFAULT_AUTHORITY_GAP_SCAN_ORDER: readonly AuthorityPagePlatform[] =
  ['fandom', 'genius', 'wikipedia'];

export interface ExistingAuthoritySurface {
  readonly platform: string;
  readonly url?: string | null;
}

export interface UnlinkedPeerMention {
  readonly peerName: string;
  readonly peerPageUrl: string;
  readonly artistNameAsMentioned: string;
  readonly platform: AuthorityPagePlatform;
}

export interface AuthorityPageGapInput {
  readonly userId: string;
  readonly creatorProfileId: string;
  readonly artistName: string;
  readonly jovieUsername?: string | null;
  /** Existing authority / identity surfaces for the claimed profile. */
  readonly existingSurfaces: readonly ExistingAuthoritySurface[];
  /** Optional evidence: plain-text mentions on peer pages (Cosmic Gate pattern). */
  readonly unlinkedMentions?: readonly UnlinkedPeerMention[];
  /** Prefill facts for the draft skill (releases, collabs, confirmed press). */
  readonly graphContext?: Omit<ClaimedGraphContext, 'artistName'>;
  /**
   * Platforms to evaluate. Defaults to Fandom → Genius → Wikipedia.
   * Missing platforms become gap opportunities.
   */
  readonly platformsToScan?: readonly AuthorityPagePlatform[];
}

export interface AuthorityPageGap {
  readonly platform: AuthorityPagePlatform;
  readonly platformLabel: string;
  readonly reason: string;
  readonly evidence: readonly UnlinkedPeerMention[];
  readonly publishGate: 'agent_assisted' | 'human_only';
}

export interface AuthorityCreatePagePayload {
  readonly playbook: typeof AUTHORITY_CREATE_PAGE_KIND;
  readonly platform: AuthorityPagePlatform;
  readonly platformLabel: string;
  readonly publishGate: 'agent_assisted' | 'human_only';
  readonly creatorProfileId: string;
  readonly artistName: string;
  readonly title: string;
  readonly why: string;
  readonly primaryActionLabel: string;
  readonly createUrl: string;
  readonly humanGateRequired: boolean;
  readonly unlinkedMentions: readonly UnlinkedPeerMention[];
  readonly graphContext: ClaimedGraphContext;
}

const SURFACE_PLATFORM_ALIASES: Readonly<
  Record<string, AuthorityPagePlatform | undefined>
> = {
  fandom: 'fandom',
  edm_fandom: 'fandom',
  'edm.fandom': 'fandom',
  wikia: 'fandom',
  genius: 'genius',
  wikipedia: 'wikipedia',
  enwiki: 'wikipedia',
  wikidata: undefined, // identity anchor, not a public artist page
};

function normalizePlatformKey(platform: string): string {
  return platform
    .trim()
    .toLowerCase()
    .replaceAll(/[\s-]+/g, '_');
}

export function surfaceCoversAuthorityPlatform(
  surface: ExistingAuthoritySurface,
  platform: AuthorityPagePlatform
): boolean {
  const key = normalizePlatformKey(surface.platform);
  const mapped = SURFACE_PLATFORM_ALIASES[key];
  if (mapped === platform) return true;

  const url = surface.url?.toLowerCase() ?? '';
  if (platform === 'fandom' && url.includes('fandom.com')) return true;
  if (platform === 'genius' && url.includes('genius.com')) return true;
  if (
    platform === 'wikipedia' &&
    (url.includes('wikipedia.org') || url.includes('wikidata.org/wiki/Q'))
  ) {
    // A real Wikipedia article URL counts; bare Wikidata Q pages alone do not
    // satisfy the public wiki page gap (AEO identity is separate).
    return url.includes('wikipedia.org');
  }
  return false;
}

export function detectAuthorityPageGaps(
  input: AuthorityPageGapInput
): readonly AuthorityPageGap[] {
  const scan = input.platformsToScan ?? DEFAULT_AUTHORITY_GAP_SCAN_ORDER;
  const mentions = input.unlinkedMentions ?? [];

  const gaps: AuthorityPageGap[] = [];
  for (const platform of scan) {
    if (!isAuthorityPagePlatform(platform)) continue;
    const covered = input.existingSurfaces.some(surface =>
      surfaceCoversAuthorityPlatform(surface, platform)
    );
    if (covered) continue;

    const evidence = mentions.filter(m => m.platform === platform);
    const meta = AUTHORITY_PLATFORM_META[platform];
    const reason =
      evidence.length > 0
        ? `${meta.gapWhy} Example: unlinked mention on ${evidence[0].peerName}.`
        : meta.gapWhy;

    gaps.push({
      platform,
      platformLabel: meta.label,
      reason,
      evidence,
      publishGate: meta.publishGate,
    });
  }

  return gaps;
}

export function buildAuthorityCreatePagePayload(
  input: AuthorityPageGapInput,
  gap: AuthorityPageGap
): AuthorityCreatePagePayload {
  const meta = AUTHORITY_PLATFORM_META[gap.platform];
  const artistName = input.artistName.trim();
  const graphContext: ClaimedGraphContext = {
    artistName,
    ...input.graphContext,
    jovieUsername:
      input.graphContext?.jovieUsername ?? input.jovieUsername ?? null,
  };

  // Prefer draft-first CTA for agent-assisted platforms; Wikipedia stays explicit.
  const primaryActionLabel =
    gap.publishGate === 'human_only' ? 'Review draft' : 'Draft page';

  const title = `Create ${meta.label} page for ${artistName}`;

  const createUrl =
    gap.platform === 'fandom'
      ? `https://edm.fandom.com/wiki/${encodeURIComponent(artistName.replaceAll(' ', '_'))}?action=edit&redlink=1`
      : meta.createUrlTemplate;

  return {
    playbook: AUTHORITY_CREATE_PAGE_KIND,
    platform: gap.platform,
    platformLabel: meta.label,
    publishGate: gap.publishGate,
    creatorProfileId: input.creatorProfileId,
    artistName,
    title,
    why: gap.reason,
    primaryActionLabel,
    createUrl,
    humanGateRequired: gap.publishGate === 'human_only',
    unlinkedMentions: gap.evidence,
    graphContext,
  };
}

export function buildAuthorityCreatePagePayloads(
  input: AuthorityPageGapInput
): readonly AuthorityCreatePagePayload[] {
  return detectAuthorityPageGaps(input).map(gap =>
    buildAuthorityCreatePagePayload(input, gap)
  );
}

function idempotencyKeyFor(
  userId: string,
  creatorProfileId: string,
  platform: AuthorityPagePlatform
): string {
  return `${userId}:authority-create:${creatorProfileId}:${platform}`;
}

/**
 * Insert pending suggested_actions cards for each missing authority page.
 * Idempotent per (user, profile, platform) via app-layer key lookup +
 * onConflictDoNothing when a unique constraint is present.
 */
export async function emitAuthorityPageGapOpportunities(
  input: AuthorityPageGapInput
): Promise<{
  readonly created: number;
  readonly actionIds: readonly string[];
  readonly platforms: readonly AuthorityPagePlatform[];
}> {
  const payloads = buildAuthorityCreatePagePayloads(input);
  if (payloads.length === 0) {
    return { created: 0, actionIds: [], platforms: [] };
  }

  const actionIds: string[] = [];
  const platforms: AuthorityPagePlatform[] = [];

  for (const payload of payloads) {
    const idempotencyKey = idempotencyKeyFor(
      input.userId,
      input.creatorProfileId,
      payload.platform
    );

    try {
      // App-layer at-most-once: suggested_actions.idempotency_key is not unique
      // in all environments, so lookup first.
      const existing = await db
        .select({ id: suggestedActions.id })
        .from(suggestedActions)
        .where(eq(suggestedActions.idempotencyKey, idempotencyKey))
        .limit(1);

      if (existing.length > 0) {
        continue;
      }

      const inserted = await db
        .insert(suggestedActions)
        .values({
          userId: input.userId,
          kind: AUTHORITY_CREATE_PAGE_KIND,
          payload,
          status: 'pending',
          signalType: 'other',
          sourceRefs: [
            {
              kind: 'authority_page_gap',
              platform: payload.platform,
              creatorProfileId: input.creatorProfileId,
              unlinkedMentions: payload.unlinkedMentions,
            },
          ],
          rationale: payload.why,
          idempotencyKey,
          sideEffects: [],
        })
        .onConflictDoNothing()
        .returning({ id: suggestedActions.id });

      if (inserted.length === 0) continue;

      actionIds.push(inserted[0].id);
      platforms.push(payload.platform);

      logger.info('[authority-page-gap] emitted opportunity card', {
        userId: input.userId,
        creatorProfileId: input.creatorProfileId,
        platform: payload.platform,
        actionId: inserted[0].id,
      });
    } catch (error) {
      await captureError(
        'Failed to emit authority page gap opportunity',
        error,
        {
          userId: input.userId,
          creatorProfileId: input.creatorProfileId,
          platform: payload.platform,
        }
      );
    }
  }

  return { created: actionIds.length, actionIds, platforms };
}

/** Platforms known to the detector (exported for tests / docs). */
export { AUTHORITY_PAGE_PLATFORMS as SCANNED_AUTHORITY_PLATFORMS } from '@/lib/authority';
