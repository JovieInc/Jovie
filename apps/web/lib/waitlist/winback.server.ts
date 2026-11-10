import 'server-only';

/**
 * DB half of the win-back loop plumbing. Nothing here sends an email:
 * drafts land in `ingestion_jobs` with status `held_for_approval`, and the
 * send-time approval gate lives in the win-back email processor
 * (`processWaitlistEmailJob`, type `winback_capability_shipped`).
 *
 * Two seams, both fail-closed (founder dispatch 2026-11-09):
 * - `capability_wants` table: added by a parallel PR. Until it exists the
 *   matcher returns zero candidates with a `capability_wants_pending` seam
 *   marker instead of guessing.
 * - Shared qualification re-check: composed through
 *   `evaluateAcquisitionEligibility` (lib/acquisition/eligibility.ts). The
 *   default composer reports UNKNOWN (fail-closed) until the parallel PR's
 *   evidence composition is merged; callers may inject a real composer.
 */

import { and, desc, sql as drizzleSql, eq, inArray } from 'drizzle-orm';
import { unknownAcquisitionEligibility } from '@/lib/acquisition/eligibility';
import { type DbOrTransaction } from '@/lib/db';
import { serverAnalyticsEvents } from '@/lib/db/schema/analytics';
import { ingestionJobs } from '@/lib/db/schema/ingestion';
import { ovieOperatingKv } from '@/lib/db/schema/ovie';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { encryptPII } from '@/lib/utils/pii-encryption';
import { generateWaitlistInviteTokenPair } from '@/lib/waitlist/tokens';
import {
  WINBACK_EMAIL_TEMPLATE_VERSION,
  WINBACK_MATCHABLE_STATUSES,
  type WinbackApprovalRecord,
  winbackApprovalKvKey,
  winbackApprovalRecordSchema,
  winbackResumeKvKey,
  winbackSendApprovalError,
} from '@/lib/waitlist/winback';
import { trackWinbackEvent } from '@/lib/waitlist/winback-analytics';
import { readKvJson } from '@/lib/waitlist/winback-signals.server';

// ---------------------------------------------------------------------------
// Shared qualification re-check (seam).
// ---------------------------------------------------------------------------

export type WinbackQualificationVerdict = 'ELIGIBLE' | 'BLOCKED' | 'UNKNOWN';

export interface WinbackQualificationDecision {
  readonly verdict: WinbackQualificationVerdict;
  readonly detail: string;
}

export type WinbackQualificationDecider = (input: {
  entryId: string;
  capabilityKey: string;
  now: Date;
}) => Promise<WinbackQualificationDecision>;

/**
 * Default re-check: runs the SHARED qualification decision
 * (`evaluateAcquisitionEligibility`) over an explicit unknown-evidence
 * composer, which fails closed to UNKNOWN — an unknown verdict never gets a
 * draft. Wiring the real cone-evidence composer here is the seam for the
 * parallel qualification PR.
 */
export const defaultWinbackQualificationDecider: WinbackQualificationDecider =
  async ({ capabilityKey, now }) => {
    const eligibility = unknownAcquisitionEligibility(
      now,
      `winback: cone evidence not composed for ${capabilityKey} (qualification seam pending)`
    );
    return { verdict: eligibility.verdict, detail: eligibility.instruction };
  };

// ---------------------------------------------------------------------------
// Matcher.
// ---------------------------------------------------------------------------

export interface WinbackCandidate {
  readonly entryId: string;
  readonly status: string;
  readonly wants: readonly { readonly kind: string; readonly text: string }[];
  readonly handle: string | null;
  readonly qualification: WinbackQualificationDecision;
}

export interface WinbackMatchResult {
  readonly capabilityKey: string;
  readonly seam: 'ready' | 'capability_wants_pending';
  readonly seamDetail: string | null;
  readonly candidates: readonly WinbackCandidate[];
}

async function loadCapabilityWantRows(
  tx: DbOrTransaction,
  capabilityKey: string
): Promise<{
  seam: 'ready' | 'capability_wants_pending';
  rows: { entryId: string; kind: string; text: string }[];
}> {
  const table = await tx.execute<{ regclass: string | null }>(
    drizzleSql`SELECT to_regclass('public.capability_wants')::text AS "regclass"`
  );
  if (!table.rows[0]?.regclass) {
    return { seam: 'capability_wants_pending', rows: [] };
  }

  // capability_wants (parallel PR): kind want|objection|current_tool, text
  // in the person's own words, capability_key, waitlist_entry_id.
  const rows = await tx.execute<{
    waitlist_entry_id: string;
    kind: string;
    text: string;
  }>(
    drizzleSql`SELECT waitlist_entry_id, kind::text AS kind, text FROM capability_wants
      WHERE capability_key = ${capabilityKey} AND resolved_at IS NULL`
  );
  return {
    seam: 'ready',
    rows: rows.rows.map(row => ({
      entryId: row.waitlist_entry_id,
      kind: row.kind,
      text: row.text,
    })),
  };
}

async function loadMatchableStatuses(tx: DbOrTransaction): Promise<string[]> {
  const result = await tx.execute<{ value: string }>(
    drizzleSql`SELECT unnest(enum_range(NULL::waitlist_status))::text AS value`
  );
  const live = new Set(result.rows.map(row => row.value));
  return WINBACK_MATCHABLE_STATUSES.filter(status => live.has(status));
}

/**
 * Entries in queued/waitlisted/disqualified state with an unresolved
 * capability_wants row for `capabilityKey`, re-checked through the shared
 * qualification decision, plus their wants text.
 */
export async function matchWinbackCandidates(
  tx: DbOrTransaction,
  capabilityKey: string,
  options: {
    now?: Date;
    qualification?: WinbackQualificationDecider;
  } = {}
): Promise<WinbackMatchResult> {
  const now = options.now ?? new Date();
  const decider = options.qualification ?? defaultWinbackQualificationDecider;

  const wantLoad = await loadCapabilityWantRows(tx, capabilityKey);
  if (wantLoad.seam === 'capability_wants_pending') {
    return {
      capabilityKey,
      seam: 'capability_wants_pending',
      seamDetail:
        'capability_wants table not present yet (parallel PR pending); matched nothing',
      candidates: [],
    };
  }

  const statuses = await loadMatchableStatuses(tx);
  const wantsByEntry = new Map<string, { kind: string; text: string }[]>();
  for (const row of wantLoad.rows) {
    const list = wantsByEntry.get(row.entryId) ?? [];
    list.push({ kind: row.kind, text: row.text });
    wantsByEntry.set(row.entryId, list);
  }

  const candidates: WinbackCandidate[] = [];
  for (const [entryId, wants] of wantsByEntry) {
    const [entry] = await tx
      .select({ id: waitlistEntries.id, status: waitlistEntries.status })
      .from(waitlistEntries)
      .where(eq(waitlistEntries.id, entryId))
      .limit(1);
    if (!entry || !statuses.includes(entry.status)) continue;

    const [profile] = await tx
      .select({ handle: creatorProfiles.handle })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.waitlistEntryId, entryId))
      .limit(1);

    candidates.push({
      entryId,
      status: entry.status,
      wants,
      handle: profile?.handle ?? null,
      qualification: await decider({ capabilityKey, entryId, now }),
    });
  }

  return { capabilityKey, seam: 'ready', seamDetail: null, candidates };
}

// ---------------------------------------------------------------------------
// Held drafts.
// ---------------------------------------------------------------------------

export interface WinbackDraftInput {
  readonly entryId: string;
  readonly capabilityKey: string;
  readonly capabilityLabel: string;
  readonly wants: readonly string[];
  readonly handle: string;
  readonly batchId: string;
  readonly origin: string;
  /** The person's waitlist cohort (queued/waitlisted/disqualified). */
  readonly cohort: string;
}

/**
 * Create a held draft (status `held_for_approval`) for one candidate. Never
 * called automatically: the dry run reports candidates, an operator batches
 * them, and only an approved batch can promote drafts to sendable.
 */
export async function enqueueWinbackDraftEmail(
  tx: DbOrTransaction,
  input: WinbackDraftInput,
  options: { now?: Date } = {}
): Promise<string> {
  const now = options.now ?? new Date();
  const tokenPair = generateWaitlistInviteTokenPair(now);
  const encryptedToken = encryptPII(tokenPair.token);
  if (!encryptedToken) {
    throw new Error('Failed to encrypt winback resume token');
  }

  await tx
    .insert(ovieOperatingKv)
    .values({
      key: winbackResumeKvKey(tokenPair.tokenHash),
      value: {
        entryId: input.entryId,
        batchId: input.batchId,
        capabilityKey: input.capabilityKey,
      },
      updatedAt: now,
    })
    .onConflictDoNothing();

  const [job] = await tx
    .insert(ingestionJobs)
    .values({
      jobType: 'send_waitlist_email',
      payload: {
        entryId: input.entryId,
        type: 'winback_capability_shipped',
        capabilityKey: input.capabilityKey,
        capabilityLabel: input.capabilityLabel,
        wants: [...input.wants],
        handle: input.handle,
        batchId: input.batchId,
        origin: input.origin,
        templateVersion: WINBACK_EMAIL_TEMPLATE_VERSION,
        encryptedResumeToken: encryptedToken,
      },
      status: 'held_for_approval',
      runAt: now,
      maxAttempts: 3,
      dedupKey: `waitlist_email:winback_capability_shipped:${input.entryId}:${input.capabilityKey}`,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: ingestionJobs.id });

  await trackWinbackEvent('winback_drafted', {
    entry_id: input.entryId,
    capability_key: input.capabilityKey,
    batch_id: input.batchId,
    template_version: WINBACK_EMAIL_TEMPLATE_VERSION,
    winback_cohort: input.cohort,
  });

  return (
    job?.id ??
    `waitlist_email:winback_capability_shipped:${input.entryId}:${input.capabilityKey}`
  );
}

// ---------------------------------------------------------------------------
// Approval records.
// ---------------------------------------------------------------------------

export async function saveWinbackApprovalRecord(
  tx: DbOrTransaction,
  record: WinbackApprovalRecord
): Promise<void> {
  const error = winbackSendApprovalError(record, {
    batchId: record.batchId,
    templateVersion: record.templateVersion,
    entryId: record.entryIds[0],
  });
  if (error) throw new Error(`Invalid winback approval record: ${error}`);
  const now = new Date();
  await tx
    .insert(ovieOperatingKv)
    .values({
      key: winbackApprovalKvKey(record.batchId),
      value: record,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: ovieOperatingKv.key,
      set: { value: record, updatedAt: now },
    });
}

export async function getWinbackApprovalRecord(
  tx: DbOrTransaction,
  batchId: string
): Promise<unknown> {
  return readKvJson(tx, winbackApprovalKvKey(batchId));
}

/**
 * Promote a batch's held drafts to sendable (`pending`) — only when a valid
 * approval record exists. Not wired to any route or button: the operator
 * path lands with Tim's approval of the template and the first batch.
 */
export async function promoteApprovedWinbackBatch(
  tx: DbOrTransaction,
  batchId: string
): Promise<{ promoted: number }> {
  const approval = await getWinbackApprovalRecord(tx, batchId);
  const record = winbackApprovalRecordSchema.safeParse(approval);
  if (!record.success) {
    throw new Error(
      `winback batch ${batchId} has no valid approval record; nothing promoted`
    );
  }

  const held = await tx
    .select({ id: ingestionJobs.id, payload: ingestionJobs.payload })
    .from(ingestionJobs)
    .where(
      and(
        eq(ingestionJobs.jobType, 'send_waitlist_email'),
        eq(ingestionJobs.status, 'held_for_approval'),
        drizzleSql`${ingestionJobs.payload}->>'batchId' = ${batchId}`
      )
    );

  const approvedEntryIds = new Set(record.data.entryIds);
  const promotable = held
    .filter(
      row =>
        (row.payload as Record<string, unknown>).type ===
          'winback_capability_shipped' &&
        approvedEntryIds.has(
          String((row.payload as Record<string, unknown>).entryId)
        )
    )
    .map(row => row.id);
  if (promotable.length === 0) return { promoted: 0 };

  const promoted = await tx
    .update(ingestionJobs)
    .set({ status: 'pending', updatedAt: new Date() })
    .where(inArray(ingestionJobs.id, promotable))
    .returning({ id: ingestionJobs.id });

  await trackWinbackEvent('winback_approved', {
    batch_id: batchId,
    capability_key: record.data.capabilityKey,
    template_version: record.data.templateVersion,
    winback_cohort: 'approved',
  });
  return { promoted: promoted.length };
}

// ---------------------------------------------------------------------------
// 14-day budget check (JOV-6655), enforced at send time.
// ---------------------------------------------------------------------------

const WINBACK_REPLY_EVENTS = [
  'winback_opened',
  'winback_clicked',
  'returned',
] as const;

export async function getLastUnansweredWinbackSentAt(
  tx: DbOrTransaction,
  entryId: string
): Promise<Date | null> {
  const [lastSent] = await tx
    .select({ occurredAt: serverAnalyticsEvents.occurredAt })
    .from(serverAnalyticsEvents)
    .where(
      and(
        eq(serverAnalyticsEvents.eventName, 'winback_sent'),
        drizzleSql`${serverAnalyticsEvents.properties}->>'entry_id' = ${entryId}`
      )
    )
    .orderBy(desc(serverAnalyticsEvents.occurredAt))
    .limit(1);
  if (!lastSent) return null;

  const [lastReply] = await tx
    .select({ occurredAt: serverAnalyticsEvents.occurredAt })
    .from(serverAnalyticsEvents)
    .where(
      and(
        inArray(serverAnalyticsEvents.eventName, [...WINBACK_REPLY_EVENTS]),
        drizzleSql`${serverAnalyticsEvents.properties}->>'entry_id' = ${entryId}`,
        drizzleSql`${serverAnalyticsEvents.occurredAt} > ${lastSent.occurredAt.toISOString()}`
      )
    )
    .orderBy(desc(serverAnalyticsEvents.occurredAt))
    .limit(1);

  if (lastReply && lastReply.occurredAt > lastSent.occurredAt) return null;
  return lastSent.occurredAt;
}
