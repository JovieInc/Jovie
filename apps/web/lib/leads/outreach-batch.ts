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

export const OUTREACH_QUEUE_CLAIM_TTL_MS = 5 * 60 * 1000;

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

async function getSendCapacity(
  now: Date,
  options: ProcessOutreachBatchOptions = {}
): Promise<{
  dailyRemaining: number;
  hourlyRemaining: number;
}> {
  try {
    const [settings] = await db
      .select()
      .from(leadPipelineSettings)
      .where(eq(leadPipelineSettings.id, 1))
      .limit(1);

    if (!options.ignorePipelineEnabled && settings?.enabled === false) {
      return { dailyRemaining: 0, hourlyRemaining: 0 };
    }

    const dailySendCap = settings?.dailySendCap ?? 10;
    const maxPerHour = settings?.maxPerHour ?? 5;
    const startOfDay = getStartOfDay(now);
    const startOfHour = getStartOfHour(now);

    const [[dayRow], [hourRow]] = await Promise.all([
      db
        .select({ total: count() })
        .from(leads)
        .where(
          or(
            gte(leads.outreachQueuedAt, startOfDay),
            gte(leads.dmSentAt, startOfDay)
          )
        ),
      db
        .select({ total: count() })
        .from(leads)
        .where(
          or(
            gte(leads.outreachQueuedAt, startOfHour),
            gte(leads.dmSentAt, startOfHour)
          )
        ),
    ]);

    return {
      dailyRemaining: Math.max(0, dailySendCap - Number(dayRow?.total ?? 0)),
      hourlyRemaining: Math.max(0, maxPerHour - Number(hourRow?.total ?? 0)),
    };
  } catch (error) {
    await captureError('Failed to compute outreach send capacity', error, {
      route: 'outreach-batch',
    });
    return { dailyRemaining: 0, hourlyRemaining: 0 };
  }
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

/**
 * Process a batch of pending outreach emails.
 * Reusable from both the API route and the cron job.
 */
export async function processOutreachBatch(
  limit: number,
  options: ProcessOutreachBatchOptions = {}
): Promise<OutreachBatchResult> {
  const now = new Date();
  const claimCutoff = new Date(now.getTime() - OUTREACH_QUEUE_CLAIM_TTL_MS);
  const pendingEmailWhereClause = getPendingEmailWhereClause(now);
  const sendCapacity = await getSendCapacity(now, options);
  const effectiveLimit = Math.max(
    0,
    Math.min(limit, sendCapacity.dailyRemaining, sendCapacity.hourlyRemaining)
  );

  if (effectiveLimit === 0) {
    return {
      attempted: 0,
      queued: 0,
      failed: 0,
      dismissed: 0,
      remainingPending: 0,
    };
  }

  const pendingEmailLeads = await db
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

  let attempted = 0;
  let queued = 0;
  let failed = 0;
  let dismissed = 0;

  for (const lead of pendingEmailLeads) {
    const claimedAt = new Date();
    const [claimedLead] = await db
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

    if (!claimedLead) continue;

    attempted++;

    if (!lead.contactEmail || !lead.claimToken) {
      continue;
    }

    try {
      const hasDuplicate = await hasCompetingQueuedEmailLead(
        lead.contactEmail,
        lead.id,
        claimedAt
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
          firstContactedAt: claimedAt,
          lastContactedAt: claimedAt,
          updatedAt: claimedAt,
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
