import 'server-only';

import { and, sql as drizzleSql, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agentVisibilityDrafts } from '@/lib/db/schema/agent-drafts';
import { captureError } from '@/lib/error-tracking';
import type { AgentDraftRow } from './draft-store';

/**
 * Draft reservation for the agent claim (JOV-9760). Plain `db` only: the
 * drafts table is reachable only outside an RLS session (owner bridge).
 */

/**
 * Single use, taken BEFORE the profile transaction: compare-and-set on
 * claimed_at that also requires the stored preview to equal what was
 * checked. Once set, the agent can no longer change the launch
 * (`storeAgentReleaseLaunch` requires claimed_at IS NULL), so the claimed
 * content is exactly the reviewed content.
 */
export async function reserveAgentDraft(
  row: AgentDraftRow,
  now: Date,
  staleClaimedAt: Date | null = null
): Promise<boolean> {
  const reserved = await db
    .update(agentVisibilityDrafts)
    .set({ claimedAt: now })
    .where(
      and(
        eq(agentVisibilityDrafts.id, row.id),
        // Fresh reservation, or a takeover of the exact stale value we saw.
        staleClaimedAt
          ? eq(agentVisibilityDrafts.claimedAt, staleClaimedAt)
          : isNull(agentVisibilityDrafts.claimedAt),
        gt(agentVisibilityDrafts.expiresAt, now),
        drizzleSql`${agentVisibilityDrafts.preview} = ${JSON.stringify(row.preview)}::jsonb`
      )
    )
    .returning({ id: agentVisibilityDrafts.id });
  return reserved.length === 1;
}

/**
 * A reservation with no committed profile older than this is abandoned (the
 * process crashed or timed out between reserve and release, or the release
 * failed). The claim transaction itself is bounded far below this.
 */
export const AGENT_CLAIM_RESERVATION_STALE_MS = 5 * 60 * 1000;

/** Undo our own reservation when the profile transaction did not commit. */
export async function releaseAgentDraft(
  draftId: string,
  at: Date
): Promise<void> {
  try {
    await db
      .update(agentVisibilityDrafts)
      .set({ claimedAt: null })
      .where(
        and(
          eq(agentVisibilityDrafts.id, draftId),
          eq(agentVisibilityDrafts.claimedAt, at)
        )
      );
  } catch (error) {
    await captureError('Agent draft reservation release failed', error, {
      route: '/claim/agent',
    });
  }
}
