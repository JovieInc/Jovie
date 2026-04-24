import 'server-only';

import {
  and,
  count,
  desc,
  sql as drizzleSql,
  eq,
  gte,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
} from 'drizzle-orm';
import { getAppUrl } from '@/constants/domains';
import { db } from '@/lib/db';
import { leadPipelineSettings, leads } from '@/lib/db/schema/leads';
import { captureError } from '@/lib/error-tracking';
import { recordLeadFunnelEvent } from '@/lib/leads/funnel-events';
import { pushLeadToInstantly } from '@/lib/leads/instantly';
import { isEmailSuppressed } from '@/lib/notifications/suppression';

export const OUTREACH_QUEUE_CLAIM_TTL_MS = 5 * 60 * 1000;

// Postgres advisory lock key for serializing concurrent outreach batches.
// Value is arbitrary but stable; picked high enough to avoid collision with
// other advisory lock users in the codebase.
const OUTREACH_BATCH_ADVISORY_LOCK_KEY = 4_827_391_284n;

interface ProcessOutreachBatchOptions {
  readonly ignorePipelineEnabled?: boolean;
}

function getStartOfDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

function getStartOfHour(now: Date): Date {
  const date = new Date(now);
  date.setUTCMinutes(0, 0, 0);
  return date;
}

function getPendingEmailWhereClause(now = new Date()) {
  const claimCutoff = new Date(now.getTime() - OUTREACH_QUEUE_CLAIM_TTL_MS);

  return and(
    or(eq(leads.outreachRoute, 'email'), eq(leads.outreachRoute, 'both')),
    eq(leads.outreachStatus, 'pending'),
    eq(leads.status, 'approved'),
    eq(leads.emailInvalid, false),
    isNotNull(leads.contactEmail),
    isNotNull(leads.claimToken),
    or(isNull(leads.outreachQueuedAt), lt(leads.outreachQueuedAt, claimCutoff))
  );
}

async function hasCompetingQueuedEmailLead(
  email: string,
  leadId: string,
  claimedAt: Date
): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();

  try {
    const [duplicate] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(
        and(
          drizzleSql`lower(${leads.contactEmail}) = ${normalizedEmail}`,
          ne(leads.id, leadId),
          or(
            isNotNull(leads.dmSentAt),
            eq(leads.outreachStatus, 'queued'),
            eq(leads.outreachStatus, 'sent'),
            eq(leads.outreachStatus, 'dm_sent'),
            and(
              eq(leads.outreachStatus, 'pending'),
              isNotNull(leads.outreachQueuedAt),
              or(
                lt(leads.outreachQueuedAt, claimedAt),
                drizzleSql`(${leads.outreachQueuedAt} = ${claimedAt} and ${leads.id}::text < ${leadId})`
              )
            )
          )
        )
      )
      .limit(1);

    return Boolean(duplicate?.id);
  } catch (error) {
    await captureError('Failed to evaluate outreach email dedupe', error, {
      route: 'outreach-batch',
      contextData: { leadId },
    });
    throw error;
  }
}

export interface OutreachBatchResult {
  attempted: number;
  queued: number;
  failed: number;
  dismissed: number;
  remainingPending: number;
}

function getOutreachErrorStatusCode(error: unknown): number | null {
  const responseStatus = (error as { response?: { status?: unknown } })
    ?.response?.status;
  if (typeof responseStatus === 'number') {
    return responseStatus;
  }

  const message = error instanceof Error ? error.message : String(error);
  const match = /(?:api error|status)\s+(\d{3})/i.exec(message);
  return match ? Number(match[1]) : null;
}

function isPermanentOutreachError(error: unknown): boolean {
  const status = getOutreachErrorStatusCode(error);
  return status !== null && status >= 400 && status < 500 && status !== 429;
}

interface ClaimedLead {
  id: string;
  linktreeHandle: string;
  displayName: string | null;
  contactEmail: string | null;
  claimToken: string | null;
  priorityScore: number | null;
  claimedAt: Date;
}

/**
 * Claim phase: serialized via pg advisory lock. Holds a transaction that
 * reads settings + capacity and atomically claims up to `limit` leads by
 * setting their outreachQueuedAt. Concurrent batches either wait their
 * turn or, if the lock is already held, return an empty claim set.
 */
async function claimOutreachLeads(
  limit: number,
  now: Date,
  options: ProcessOutreachBatchOptions
): Promise<ClaimedLead[]> {
  const claimCutoff = new Date(now.getTime() - OUTREACH_QUEUE_CLAIM_TTL_MS);
  const pendingEmailWhereClause = getPendingEmailWhereClause(now);

  return db.transaction(async tx => {
    const lockRows = await tx.execute<{ locked: boolean }>(
      drizzleSql`SELECT pg_try_advisory_xact_lock(${OUTREACH_BATCH_ADVISORY_LOCK_KEY}) AS locked`
    );
    const locked = Boolean(
      (lockRows as unknown as { rows?: Array<{ locked: boolean }> }).rows?.[0]
        ?.locked ??
        (lockRows as unknown as Array<{ locked: boolean }>)[0]?.locked
    );
    if (!locked) {
      return [];
    }

    const [settings] = await tx
      .select()
      .from(leadPipelineSettings)
      .where(eq(leadPipelineSettings.id, 1))
      .limit(1);

    if (!options.ignorePipelineEnabled && settings?.enabled === false) {
      return [];
    }

    const dailySendCap = settings?.dailySendCap ?? 10;
    const maxPerHour = settings?.maxPerHour ?? 5;
    const startOfDay = getStartOfDay(now);
    const startOfHour = getStartOfHour(now);

    const [[dayRow], [hourRow]] = await Promise.all([
      tx
        .select({ total: count() })
        .from(leads)
        .where(
          or(
            gte(leads.outreachQueuedAt, startOfDay),
            gte(leads.dmSentAt, startOfDay)
          )
        ),
      tx
        .select({ total: count() })
        .from(leads)
        .where(
          or(
            gte(leads.outreachQueuedAt, startOfHour),
            gte(leads.dmSentAt, startOfHour)
          )
        ),
    ]);

    const dailyRemaining = Math.max(
      0,
      dailySendCap - Number(dayRow?.total ?? 0)
    );
    const hourlyRemaining = Math.max(
      0,
      maxPerHour - Number(hourRow?.total ?? 0)
    );

    const effectiveLimit = Math.max(
      0,
      Math.min(limit, dailyRemaining, hourlyRemaining)
    );
    if (effectiveLimit === 0) return [];

    const candidates = await tx
      .select({
        id: leads.id,
        linktreeHandle: leads.linktreeHandle,
        displayName: leads.displayName,
        contactEmail: leads.contactEmail,
        claimToken: leads.claimToken,
        priorityScore: leads.priorityScore,
      })
      .from(leads)
      .where(pendingEmailWhereClause)
      .orderBy(desc(leads.priorityScore), desc(leads.createdAt))
      .limit(effectiveLimit);

    const claimed: ClaimedLead[] = [];
    for (const lead of candidates) {
      const claimedAt = new Date();
      const [claimedLead] = await tx
        .update(leads)
        .set({ outreachQueuedAt: claimedAt, updatedAt: claimedAt })
        .where(
          and(
            eq(leads.id, lead.id),
            eq(leads.outreachStatus, 'pending'),
            or(
              isNull(leads.outreachQueuedAt),
              lt(leads.outreachQueuedAt, claimCutoff)
            )
          )
        )
        .returning({ id: leads.id });

      if (claimedLead) {
        claimed.push({ ...lead, claimedAt });
      }
    }

    return claimed;
  });
}

async function isPipelineEnabled(): Promise<boolean> {
  const [settings] = await db
    .select({ enabled: leadPipelineSettings.enabled })
    .from(leadPipelineSettings)
    .where(eq(leadPipelineSettings.id, 1))
    .limit(1);
  return settings?.enabled !== false;
}

async function releaseClaim(leadId: string): Promise<void> {
  await db
    .update(leads)
    .set({ outreachQueuedAt: null, updatedAt: new Date() })
    .where(eq(leads.id, leadId));
}

/**
 * Process a batch of pending outreach emails.
 * Reusable from both the API route and the cron job.
 */
export async function processOutreachBatch(
  limit: number,
  options: ProcessOutreachBatchOptions = {}
): Promise<OutreachBatchResult> {
  const now = new Date();
  const pendingEmailWhereClause = getPendingEmailWhereClause(now);

  const claimedLeads = await claimOutreachLeads(limit, now, options);

  let attempted = 0;
  let queued = 0;
  let failed = 0;
  let dismissed = 0;

  for (const lead of claimedLeads) {
    // Fix #3: Re-check kill switch between each send so an admin flip takes
    // effect mid-batch (at most one extra send per pipeline-disable event).
    if (!options.ignorePipelineEnabled) {
      const stillEnabled = await isPipelineEnabled();
      if (!stillEnabled) {
        await releaseClaim(lead.id);
        continue;
      }
    }

    attempted++;

    if (!lead.contactEmail || !lead.claimToken) {
      continue;
    }

    // Fix #1: Hard block on suppression list (unsubscribes, bounces,
    // complaints, abuse, legal). This is compliance-critical and was
    // missing from the prior WHERE-clause-only filter.
    try {
      const suppression = await isEmailSuppressed(lead.contactEmail);
      if (suppression.suppressed) {
        dismissed++;
        await db
          .update(leads)
          .set({
            outreachQueuedAt: null,
            outreachStatus: 'dismissed',
            updatedAt: new Date(),
          })
          .where(eq(leads.id, lead.id));
        continue;
      }
    } catch (suppressionError) {
      // Fail closed: if suppression lookup errors, skip the send.
      failed++;
      await releaseClaim(lead.id);
      await captureError(
        'Outreach suppression lookup failed',
        suppressionError,
        { route: 'outreach-batch', contextData: { leadId: lead.id } }
      );
      continue;
    }

    try {
      const hasDuplicate = await hasCompetingQueuedEmailLead(
        lead.contactEmail,
        lead.id,
        lead.claimedAt
      );
      if (hasDuplicate) {
        dismissed++;
        await db
          .update(leads)
          .set({
            outreachQueuedAt: null,
            outreachStatus: 'dismissed',
            updatedAt: new Date(),
          })
          .where(eq(leads.id, lead.id));
        continue;
      }

      const instantlyLeadId = await pushLeadToInstantly({
        email: lead.contactEmail,
        firstName: lead.displayName ?? lead.linktreeHandle,
        claimLink: getAppUrl(`/claim/${lead.claimToken}`),
        artistName: lead.displayName ?? lead.linktreeHandle,
        priorityScore: lead.priorityScore ?? 0,
      });

      await db
        .update(leads)
        .set({
          instantlyLeadId,
          outreachStatus: 'queued',
          firstContactedAt: lead.claimedAt,
          lastContactedAt: lead.claimedAt,
          updatedAt: lead.claimedAt,
        })
        .where(eq(leads.id, lead.id));

      queued++;

      try {
        await recordLeadFunnelEvent(
          {
            leadId: lead.id,
            eventType: 'email_queued',
            channel: 'email',
            provider: 'instantly',
            campaignKey: 'claim_invite',
            metadata: { instantlyLeadId, claimToken: lead.claimToken },
          },
          { idempotent: true }
        );
      } catch (eventError) {
        await captureError('Outreach funnel event failed', eventError, {
          route: 'outreach-batch',
          contextData: { leadId: lead.id, instantlyLeadId },
        });
      }
    } catch (error) {
      failed++;
      const isPermanentError = isPermanentOutreachError(error);
      await db
        .update(leads)
        .set({
          outreachQueuedAt: null,
          outreachStatus: isPermanentError ? 'failed' : 'pending',
          updatedAt: new Date(),
        })
        .where(eq(leads.id, lead.id));
      await captureError('Outreach batch email failed', error, {
        route: 'outreach-batch',
        contextData: { leadId: lead.id, isPermanentError },
      });
    }
  }

  const [remainingPending] = await db
    .select({ total: count() })
    .from(leads)
    .where(pendingEmailWhereClause);

  return {
    attempted,
    queued,
    failed,
    dismissed,
    remainingPending: Number(remainingPending?.total ?? 0),
  };
}
