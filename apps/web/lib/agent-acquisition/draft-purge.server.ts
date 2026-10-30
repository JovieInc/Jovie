import 'server-only';

import { and, sql as drizzleSql, inArray, lt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agentVisibilityDrafts } from '@/lib/db/schema/agent-drafts';

/**
 * Retention for agent connector drafts (JOV-9787, #23772).
 *
 * A draft stops working at `expires_at` (7 days after creation; a claimed
 * draft is claimed before then). Expiry only blocks access, so this purge is
 * what deletes the row. Rows are deleted this long after expiry, claimed or
 * not. Keep in sync with apps/web/content/legal/privacy.md.
 */
export const AGENT_DRAFT_PURGE_AFTER_EXPIRY_DAYS = 30;
const BATCH = 500;
const MAX_BATCHES = 20;

export interface AgentDraftPurgeSummary {
  readonly deleted: number;
  readonly retentionDays: number;
  /** Age in days of the oldest row still past the cutoff (null when none). */
  readonly oldestOverdueDays: number | null;
}

/** Plain `db` only: the drafts table is unreachable inside an RLS session. */
export async function purgeExpiredAgentDrafts(
  now = new Date()
): Promise<AgentDraftPurgeSummary> {
  const cutoff = new Date(
    now.getTime() - AGENT_DRAFT_PURGE_AFTER_EXPIRY_DAYS * 86_400_000
  );
  let deleted = 0;
  for (let i = 0; i < MAX_BATCHES; i += 1) {
    const rows = await db
      .select({ id: agentVisibilityDrafts.id })
      .from(agentVisibilityDrafts)
      .where(lt(agentVisibilityDrafts.expiresAt, cutoff))
      .limit(BATCH);
    if (rows.length === 0) break;
    const gone = await db
      .delete(agentVisibilityDrafts)
      .where(
        inArray(
          agentVisibilityDrafts.id,
          rows.map(row => row.id)
        )
      )
      .returning({ id: agentVisibilityDrafts.id });
    deleted += gone.length;
    if (rows.length < BATCH) break;
  }
  const [oldest] = await db
    .select({
      days: overdueDays(),
    })
    .from(agentVisibilityDrafts)
    .where(and(lt(agentVisibilityDrafts.expiresAt, cutoff)));
  return {
    deleted,
    retentionDays: AGENT_DRAFT_PURGE_AFTER_EXPIRY_DAYS,
    oldestOverdueDays: oldest?.days ?? null,
  };
}

function overdueDays() {
  return drizzleSql<
    number | null
  >`floor(extract(epoch from (now() - min(${agentVisibilityDrafts.expiresAt}))) / 86400)::int`;
}

/**
 * Account deletion: remove the drafts a user's profiles were claimed from.
 * Drafts hold no user id; the link is the draft id recorded on the profile.
 */
export async function deleteAgentDraftsByIds(
  draftIds: readonly string[]
): Promise<number> {
  if (draftIds.length === 0) return 0;
  const gone = await db
    .delete(agentVisibilityDrafts)
    .where(inArray(agentVisibilityDrafts.id, [...draftIds]))
    .returning({ id: agentVisibilityDrafts.id });
  return gone.length;
}
