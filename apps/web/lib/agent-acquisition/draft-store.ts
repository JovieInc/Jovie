import 'server-only';

import { and, sql as drizzleSql, eq, gt, isNull } from 'drizzle-orm';
import { BASE_URL } from '@/constants/app';
import { db } from '@/lib/db';
import { agentVisibilityDrafts } from '@/lib/db/schema/agent-drafts';
import { resolveAgentArtist } from './artist-resolution';
import { agentClaimUrl } from './claim-handoff';
import { draftTokenHash, verifyDraftCapability } from './draft-capability';
import {
  createAgentDraftSchema,
  type DraftCapability,
  invalidInputError,
} from './draft-contract';
import type { StoredReleaseLaunch } from './draft-preview';

export type AgentDraftRow = typeof agentVisibilityDrafts.$inferSelect;

async function findDraft(
  capability: DraftCapability,
  token: string,
  now: Date
) {
  const [row] = await db
    .select()
    .from(agentVisibilityDrafts)
    .where(
      and(
        eq(agentVisibilityDrafts.id, capability.draft_id),
        eq(agentVisibilityDrafts.artistId, capability.artist_id),
        eq(agentVisibilityDrafts.capabilityHash, draftTokenHash(token)),
        gt(agentVisibilityDrafts.expiresAt, now),
        isNull(agentVisibilityDrafts.claimedAt)
      )
    )
    .limit(1);
  return row ?? null;
}

function presentDraft(row: AgentDraftRow) {
  const { launch, ...artist } = row.preview;
  const missing = (['bio', 'image_url'] as const).filter(
    field => !artist[field]
  );
  return {
    status: 'draft_ready' as const,
    // The person, not the agent, claims the draft: show them claim_url.
    next_action: 'send_user_claim_url' as const,
    draft_id: row.id,
    receipt_id: row.id,
    status_url: `${BASE_URL}/api/agents/drafts/${row.id}`,
    expires_at: row.expiresAt.toISOString(),
    artist,
    ...(launch ? { launch: launch.result } : {}),
    acquisition: { ...row.acquisition, draft_id: row.id },
    ownership: 'unverified' as const,
    published_url: null,
    claim_url: agentClaimUrl(row),
    missing_fields: missing,
    warnings: [
      'This draft is unpublished. Show claim_url to the user: they sign in on Jovie, the artist is matched to its Spotify identity (well-known artists go through verification), and nothing is public until they publish it.',
    ],
    retryable: false,
  };
}

const unavailable = () => ({
  status: 'error' as const,
  code: 'DRAFT_UNAVAILABLE' as const,
  next_action: 'artist.search_or_import' as const,
  retryable: false,
});

export async function readAgentDraft(draftId: string, token: string) {
  const capability = verifyDraftCapability(token);
  if (!capability || capability.draft_id !== draftId) return unavailable();
  const row = await findDraft(capability, token, new Date());
  return row ? presentDraft(row) : unavailable();
}

export async function loadAgentDraftForMutation(
  draftId: string,
  token: string
): Promise<AgentDraftRow | null> {
  const capability = verifyDraftCapability(token);
  if (!capability || capability.draft_id !== draftId) return null;
  return findDraft(capability, token, new Date());
}

/** Compare-and-set keeps racing retries from replacing a different launch. */
export async function storeAgentReleaseLaunch(
  draftId: string,
  token: string,
  expectedFingerprint: string | null,
  launch: StoredReleaseLaunch
): Promise<AgentDraftRow | null> {
  const capability = verifyDraftCapability(token);
  if (!capability || capability.draft_id !== draftId) return null;
  const now = new Date();
  const current = await findDraft(capability, token, now);
  if (!current) return null;
  await db
    .update(agentVisibilityDrafts)
    .set({ preview: { ...current.preview, launch } })
    .where(
      and(
        eq(agentVisibilityDrafts.id, capability.draft_id),
        eq(agentVisibilityDrafts.artistId, capability.artist_id),
        eq(agentVisibilityDrafts.capabilityHash, draftTokenHash(token)),
        gt(agentVisibilityDrafts.expiresAt, now),
        isNull(agentVisibilityDrafts.claimedAt),
        expectedFingerprint
          ? drizzleSql`${agentVisibilityDrafts.preview}->'launch'->>'inputFingerprint' = ${expectedFingerprint}`
          : drizzleSql`${agentVisibilityDrafts.preview}->'launch' IS NULL`
      )
    );
  return findDraft(capability, token, new Date());
}

/** One PK-protected insert makes retries and racing instances share one draft. */
export async function createAgentDraft(input: unknown) {
  const parsed = createAgentDraftSchema.safeParse(input);
  if (!parsed.success) return invalidInputError(parsed.error);
  const { artist_id: artistId, draft_token: token } = parsed.data;
  const capability = verifyDraftCapability(token);
  if (!capability || capability.artist_id !== artistId) return unavailable();
  const existing = await findDraft(capability, token, new Date());
  if (existing) return presentDraft(existing);

  const resolution = await resolveAgentArtist({
    input: capability.storefront
      ? `https://music.apple.com/${capability.storefront}/artist/${artistId.slice('apple_music:'.length)}`
      : artistId,
  });
  if (resolution.status !== 'resolved') return resolution;
  // The provider call can outlive expiry: revalidate before persistence.
  if (!verifyDraftCapability(token)) return unavailable();
  await db
    .insert(agentVisibilityDrafts)
    .values({
      id: capability.draft_id,
      artistId,
      capabilityHash: draftTokenHash(token),
      preview: resolution.artist,
      acquisition: capability.acquisition,
      expiresAt: new Date(capability.expires_at),
    })
    .onConflictDoNothing({ target: agentVisibilityDrafts.id });
  const persisted = await findDraft(capability, token, new Date());
  // A claimed/revoked/conflicting row cannot be recreated or disclosed.
  return persisted ? presentDraft(persisted) : unavailable();
}
