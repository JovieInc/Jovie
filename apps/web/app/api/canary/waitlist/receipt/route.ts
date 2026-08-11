import { createHash, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, gt, like } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth, getCachedCurrentUser } from '@/lib/auth/cached';
import {
  buildProductionWaitlistCanaryEmail,
  hashProductionWaitlistCanaryEmail,
  isExactProductionWaitlistCanaryEmail,
  PRODUCTION_WAITLIST_CANARY_ANALYTICS_EVENT,
  PRODUCTION_WAITLIST_CANARY_COMMUNICATION_POLICY,
  PRODUCTION_WAITLIST_CANARY_NAME,
  PRODUCTION_WAITLIST_CANARY_RUN_HEADER,
  parseProductionWaitlistCanaryRunId,
  productionWaitlistDurableReceiptSchema,
  productionWaitlistIncompleteReceiptSchema,
  productionWaitlistPreflightReceiptSchema,
  readProductionWaitlistAnalyticsReceipt,
  readProductionWaitlistCanaryMarker,
} from '@/lib/canaries/production-waitlist';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { baSessions, baUsers } from '@/lib/db/schema/better-auth';
import { ingestionJobs } from '@/lib/db/schema/ingestion';
import { userInterviews } from '@/lib/db/schema/user-interviews';
import { waitlistAuditLogs, waitlistEntries } from '@/lib/db/schema/waitlist';
import { env } from '@/lib/env';
import { NO_CACHE_HEADERS } from '@/lib/http/headers';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function secureEqual(provided: string, expected: string): boolean {
  const providedHash = createHash('sha256').update(provided).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_CACHE_HEADERS });
}

function isAuthorized(request: Request, token: string): boolean {
  const authorization = request.headers.get('authorization') ?? '';
  return secureEqual(authorization, `Bearer ${token}`);
}

export async function GET(request: Request) {
  const token = env.PRODUCTION_WAITLIST_CANARY_READ_TOKEN;
  const baseEmail = env.E2E_PROD_SIGNUP_EMAIL_BASE;
  if (!token || !baseEmail || env.VERCEL_ENV !== 'production') {
    return json({ error: 'Canary receipt unavailable' }, 503);
  }
  if (!isAuthorized(request, token)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let email: string;
  try {
    email = buildProductionWaitlistCanaryEmail(baseEmail);
  } catch {
    return json({ error: 'Canary receipt unavailable' }, 503);
  }
  const emailSha256 = hashProductionWaitlistCanaryEmail(email);
  const url = new URL(request.url);
  if (url.searchParams.get('mode') === 'preflight') {
    return json(
      productionWaitlistPreflightReceiptSchema.parse({
        schemaVersion: 1,
        canary: 'production-waitlist',
        environment: 'production',
        emailSha256,
        communicationPolicy: PRODUCTION_WAITLIST_CANARY_COMMUNICATION_POLICY,
        assertions: {
          exactIdentityConfigured: 'passed',
          readScopeConfigured: 'passed',
          communicationsFailClosed: 'passed',
        },
      })
    );
  }

  let runId: string | null;
  try {
    runId = parseProductionWaitlistCanaryRunId(url.searchParams.get('run_id'));
  } catch {
    return json({ error: 'Invalid run id' }, 400);
  }
  const entryIdResult = z
    .string()
    .uuid()
    .safeParse(url.searchParams.get('entry_id'));
  if (!runId || !entryIdResult.success) {
    return json({ error: 'run_id and entry_id are required' }, 400);
  }
  const entryId = entryIdResult.data;

  try {
    const identities = await db
      .select({ id: baUsers.id })
      .from(baUsers)
      .where(eq(baUsers.email, email))
      .limit(2);
    const baUser = identities.length === 1 ? identities[0] : null;

    const appUsers = baUser
      ? await db
          .select({
            id: users.id,
            waitlistEntryId: users.waitlistEntryId,
            userStatus: users.userStatus,
          })
          .from(users)
          .where(
            and(eq(users.email, email), eq(users.betterAuthUserId, baUser.id))
          )
          .limit(2)
      : [];
    const appUser = appUsers.length === 1 ? appUsers[0] : null;

    const entries = await db
      .select({
        id: waitlistEntries.id,
        status: waitlistEntries.status,
        source: waitlistEntries.source,
        canonical: waitlistEntries.canonical,
      })
      .from(waitlistEntries)
      .where(eq(waitlistEntries.emailNormalized, email))
      .limit(2);
    const entry = entries.length === 1 ? entries[0] : null;
    const exactEntryClaim = entry?.id === entryId;

    const [sessions, auditRows, interviews, emailJobs] = await Promise.all([
      baUser
        ? db
            .select({ id: baSessions.id })
            .from(baSessions)
            .where(
              and(
                eq(baSessions.userId, baUser.id),
                gt(baSessions.expiresAt, new Date())
              )
            )
            .limit(1)
        : Promise.resolve([]),
      exactEntryClaim
        ? db
            .select({ metadata: waitlistAuditLogs.metadata })
            .from(waitlistAuditLogs)
            .where(eq(waitlistAuditLogs.waitlistEntryId, entry.id))
            .orderBy(desc(waitlistAuditLogs.createdAt))
            .limit(50)
        : Promise.resolve([]),
      appUser
        ? db
            .select({ metadata: userInterviews.metadata })
            .from(userInterviews)
            .where(
              and(
                eq(userInterviews.userId, appUser.id),
                eq(userInterviews.source, 'onboarding_chat')
              )
            )
            .orderBy(desc(userInterviews.createdAt))
            .limit(50)
        : Promise.resolve([]),
      exactEntryClaim
        ? db
            .select({ id: ingestionJobs.id })
            .from(ingestionJobs)
            .where(
              and(
                eq(ingestionJobs.jobType, 'send_waitlist_email'),
                like(ingestionJobs.dedupKey, `waitlist_email:%:${entry.id}%`)
              )
            )
            .limit(1)
        : Promise.resolve([]),
    ]);

    const audit = auditRows.find(row => {
      const marker = readProductionWaitlistCanaryMarker(
        row.metadata?.syntheticCanary
      );
      return marker?.runId === runId;
    });
    const interview = interviews.find(row => {
      const marker = readProductionWaitlistCanaryMarker(
        row.metadata.syntheticCanary
      );
      return (
        marker?.runId === runId &&
        row.metadata.waitlistEntryId === entryId &&
        ['waitlisted_gate_on', 'already_waitlisted'].includes(
          row.metadata.accessOutcome ?? ''
        )
      );
    });
    const interviewMarker = readProductionWaitlistCanaryMarker(
      interview?.metadata.syntheticCanary
    );
    const analyticsReceipt = readProductionWaitlistAnalyticsReceipt(
      interview?.metadata.syntheticAnalyticsReceipt
    );

    const missing: string[] = [];
    if (!baUser || !appUser) missing.push('identity_linkage');
    if (sessions.length < 1) missing.push('session');
    if (
      !entry ||
      !exactEntryClaim ||
      entry.status !== 'waitlisted' ||
      entry.source !== 'onboarding_chat' ||
      !entry.canonical ||
      appUser?.waitlistEntryId !== entryId ||
      appUser.userStatus !== 'waitlist_pending'
    ) {
      missing.push('waitlist_entry');
    }
    if (!audit) missing.push('waitlist_audit');
    if (
      !interview ||
      interviewMarker?.runId !== runId ||
      analyticsReceipt?.runId !== runId ||
      interview.metadata.waitlistEntryId !== entryId ||
      !['waitlisted_gate_on', 'already_waitlisted'].includes(
        interview.metadata.accessOutcome ?? ''
      )
    ) {
      missing.push('analytics_receipt');
    }
    if (emailJobs.length !== 0) missing.push('email_job_suppression');

    if (missing.length > 0) {
      return json(
        productionWaitlistIncompleteReceiptSchema.parse({
          schemaVersion: 1,
          canary: 'production-waitlist',
          runId,
          emailSha256,
          status: 'incomplete',
          missing,
        }),
        409
      );
    }

    return json(
      productionWaitlistDurableReceiptSchema.parse({
        schemaVersion: 1,
        canary: 'production-waitlist',
        runId,
        emailSha256,
        entryId,
        assertions: {
          database: {
            identityLinkage: 'passed',
            session: 'passed',
            waitlistEntry: 'passed',
            waitlistAudit: 'passed',
          },
          analytics: { firstPartyWaitlistConfirmation: 'passed' },
          communications: {
            policy: PRODUCTION_WAITLIST_CANARY_COMMUNICATION_POLICY,
            emailJobCount: 0,
            auditSuppressionMarker: 'passed',
          },
        },
      })
    );
  } catch (error) {
    logger.error('[canary/waitlist/receipt] Read failed', error);
    return json({ error: 'Canary receipt read failed' }, 500);
  }
}

/**
 * Records a first-party analytics receipt from the rendered waitlist view.
 * Authentication and exact-email checks keep this unavailable to customers.
 */
export async function POST(request: Request) {
  const baseEmail = env.E2E_PROD_SIGNUP_EMAIL_BASE;
  if (!baseEmail || env.VERCEL_ENV !== 'production') {
    return json({ error: 'Canary analytics receipt unavailable' }, 503);
  }

  const { userId: appUserId } = await getCachedAuth();
  if (!appUserId) return json({ error: 'Unauthorized' }, 401);

  let runId: string | null;
  try {
    runId = parseProductionWaitlistCanaryRunId(
      request.headers.get(PRODUCTION_WAITLIST_CANARY_RUN_HEADER)
    );
  } catch {
    return json({ error: 'Invalid run id' }, 400);
  }
  if (!runId) return json({ error: 'Run id is required' }, 400);

  const currentUser = await getCachedCurrentUser();
  const email = currentUser?.primaryEmailAddress?.emailAddress;
  if (!email || !isExactProductionWaitlistCanaryEmail(email, baseEmail)) {
    return json({ error: 'Forbidden' }, 403);
  }

  try {
    const rows = await db
      .select({ id: userInterviews.id, metadata: userInterviews.metadata })
      .from(userInterviews)
      .where(
        and(
          eq(userInterviews.userId, appUserId),
          eq(userInterviews.source, 'onboarding_chat')
        )
      )
      .limit(2);
    const interview = rows.length === 1 ? rows[0] : null;
    const marker = readProductionWaitlistCanaryMarker(
      interview?.metadata.syntheticCanary
    );
    if (!interview || marker?.runId !== runId) {
      return json({ error: 'Canary traversal not found' }, 409);
    }

    await db
      .update(userInterviews)
      .set({
        metadata: {
          ...interview.metadata,
          syntheticAnalyticsReceipt: {
            schemaVersion: 1,
            name: PRODUCTION_WAITLIST_CANARY_NAME,
            runId,
            event: PRODUCTION_WAITLIST_CANARY_ANALYTICS_EVENT,
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(userInterviews.id, interview.id));

    return json({
      schemaVersion: 1,
      canary: PRODUCTION_WAITLIST_CANARY_NAME,
      runId,
      event: PRODUCTION_WAITLIST_CANARY_ANALYTICS_EVENT,
      status: 'recorded',
    });
  } catch (error) {
    logger.error('[canary/waitlist/receipt] Analytics write failed', error);
    return json({ error: 'Canary analytics receipt write failed' }, 500);
  }
}
