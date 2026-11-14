import 'server-only';

/**
 * DB half of the win-back matcher and held-draft insertion (founder dispatch
 * 2026-11-09). Nothing here sends an email. Drafts land in `ingestion_jobs`
 * with status `held_for_approval`. The send-time approval gate lives in
 * `processWaitlistWinbackEmailJob`.
 *
 * Two seams, both fail-closed:
 * - `capability_wants` table: added by a parallel PR. Until it exists the
 *   matcher returns zero candidates with a `capability_wants_pending` seam
 *   marker instead of guessing.
 * - Shared qualification re-check: composed through
 *   `evaluateAcquisitionEligibility`. The default composer reports UNKNOWN
 *   until the parallel evidence composition is merged; callers may inject a
 *   real composer.
 */

import { sql as drizzleSql, eq } from 'drizzle-orm';
import { unknownAcquisitionEligibility } from '@/lib/acquisition/eligibility';
import type { DbOrTransaction } from '@/lib/db';
import { ingestionJobs } from '@/lib/db/schema/ingestion';
import { ovieOperatingKv } from '@/lib/db/schema/ovie';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { encryptPII } from '@/lib/utils/pii-encryption';
import { generateWaitlistInviteTokenPair } from '@/lib/waitlist/tokens';
import {
  WINBACK_EMAIL_TEMPLATE_VERSION,
  WINBACK_MATCHABLE_STATUSES,
  winbackResumeKvKey,
} from '@/lib/waitlist/winback';
import { trackWinbackEvent } from '@/lib/waitlist/winback-analytics';

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
 * Default re-check: runs the shared qualification decision over an explicit
 * unknown-evidence composer, which fails closed to UNKNOWN. An unknown
 * verdict never gets a draft.
 */
export const defaultWinbackQualificationDecider: WinbackQualificationDecider =
  async ({ capabilityKey, now }) => {
    const eligibility = unknownAcquisitionEligibility(
      now,
      `winback: cone evidence not composed for ${capabilityKey} (qualification seam pending)`
    );
    return {
      verdict: eligibility.verdict,
      detail: eligibility.policy.instruction,
    };
  };

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
  const regclass = table.rows[0]?.regclass;
  if (!regclass) {
    return { seam: 'capability_wants_pending', rows: [] };
  }

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

  const statuses = new Set(await loadMatchableStatuses(tx));
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
    if (!entry || !statuses.has(entry.status)) continue;

    const [profile] = await tx
      .select({ handle: creatorProfiles.username })
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
      jobType: 'send_waitlist_winback_email',
      payload: {
        entryId: input.entryId,
        type: 'winback_capability_shipped',
        capabilityKey: input.capabilityKey,
        capabilityLabel: input.capabilityLabel,
        wants: [...input.wants],
        handle: input.handle,
        batchId: input.batchId,
        cohort: input.cohort,
        origin: input.origin,
        templateVersion: WINBACK_EMAIL_TEMPLATE_VERSION,
        encryptedResumeToken: encryptedToken,
      },
      status: 'held_for_approval',
      runAt: now,
      maxAttempts: 3,
      dedupKey: `winback_email:${input.entryId}:${input.capabilityKey}`,
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

  return job?.id ?? `winback_email:${input.entryId}:${input.capabilityKey}`;
}
