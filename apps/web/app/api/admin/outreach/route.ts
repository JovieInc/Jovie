import {
  and,
  asc,
  count,
  desc,
  eq,
  isNotNull,
  isNull,
  lt,
  or,
} from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAppUrl } from '@/constants/domains';
import { db } from '@/lib/db';
import { getDeepErrorMessage } from '@/lib/db/errors';
import { campaignSettings } from '@/lib/db/schema/admin';
import { leads } from '@/lib/db/schema/leads';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import {
  captureError,
  captureWarning,
  getSafeErrorMessage,
} from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import { pushLeadToInstantly } from '@/lib/leads/instantly';
import { outreachListQuerySchema } from '@/lib/validation/lead-schemas';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export const runtime = 'nodejs';

const queueOutreachBodySchema = z.object({
  limit: z.number().int().min(1).max(100).default(10),
});

const OUTREACH_QUEUE_CLAIM_TTL_MS = 5 * 60 * 1000;

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: NO_STORE_HEADERS }
  );
}

async function requireAdminAccess() {
  const entitlements = await getCurrentUserEntitlements();

  if (!entitlements.isAuthenticated) {
    return jsonError('Unauthorized', 401);
  }

  if (!entitlements.isAdmin) {
    return jsonError('Forbidden', 403);
  }

  return null;
}

function getOutreachRouteWhereClause(
  queue: 'email' | 'dm' | 'manual_review' | 'all'
) {
  switch (queue) {
    case 'email':
      return or(
        eq(leads.outreachRoute, 'email'),
        eq(leads.outreachRoute, 'both')
      );
    case 'dm':
      return or(eq(leads.outreachRoute, 'dm'), eq(leads.outreachRoute, 'both'));
    case 'manual_review':
      return eq(leads.outreachRoute, 'manual_review');
    case 'all':
    default:
      return isNotNull(leads.outreachRoute);
  }
}

function getPendingEmailWhereClause(now = new Date()) {
  const claimCutoff = new Date(now.getTime() - OUTREACH_QUEUE_CLAIM_TTL_MS);

  return and(
    getOutreachRouteWhereClause('email'),
    eq(leads.outreachStatus, 'pending'),
    eq(leads.status, 'approved'),
    eq(leads.emailInvalid, false),
    isNotNull(leads.contactEmail),
    isNotNull(leads.claimToken),
    or(isNull(leads.outreachQueuedAt), lt(leads.outreachQueuedAt, claimCutoff))
  );
}

function isMissingLeadEnrichmentColumnError(error: unknown): boolean {
  // Use getDeepErrorMessage to unwrap Drizzle's error wrapping —
  // the actual PG "column X does not exist" lives on .cause, not the outer error.
  const normalized = getDeepErrorMessage(error).toLowerCase();

  return (
    normalized.includes('column "spotify_popularity" does not exist') ||
    normalized.includes('column "spotify_followers" does not exist') ||
    normalized.includes('column "release_count" does not exist') ||
    normalized.includes('column "latest_release_date" does not exist') ||
    normalized.includes('column "priority_score" does not exist') ||
    normalized.includes('column "is_linktree_verified" does not exist') ||
    normalized.includes('column "music_tools_detected" does not exist')
  );
}

/**
 * GET /api/admin/outreach — List outreach leads by queue.
 */
export async function GET(request: NextRequest) {
  const authError = await requireAdminAccess();
  if (authError) {
    return authError;
  }

  try {
    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const validated = outreachListQuerySchema.safeParse(searchParams);

    if (!validated.success) {
      return NextResponse.json(
        {
          error: 'Invalid query parameters',
          details: validated.error.flatten(),
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { queue, sort, sortOrder, page, limit } = validated.data;
    const offset = (page - 1) * limit;

    const whereClause = getOutreachRouteWhereClause(queue);
    const pendingWhereClause =
      queue === 'email'
        ? getPendingEmailWhereClause()
        : and(whereClause, eq(leads.outreachStatus, 'pending'));

    // Sort
    const sortColumn =
      sort === 'priorityScore' ? leads.priorityScore : leads.createdAt;
    const orderBy = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

    // Query data and count in parallel
    let rows;
    let totalRow;
    let pendingTotalRow;

    try {
      [rows, [totalRow], [pendingTotalRow]] = await Promise.all([
        db
          .select()
          .from(leads)
          .where(whereClause)
          .orderBy(orderBy)
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(leads).where(whereClause),
        db.select({ total: count() }).from(leads).where(pendingWhereClause),
      ]);
    } catch (error) {
      if (!isMissingLeadEnrichmentColumnError(error)) {
        throw error;
      }

      await captureWarning(
        '[admin/outreach] leads enrichment columns missing; falling back to legacy select',
        error,
        { route: '/api/admin/outreach' }
      );

      [rows, [totalRow], [pendingTotalRow]] = await Promise.all([
        db
          .select({
            id: leads.id,
            linktreeHandle: leads.linktreeHandle,
            linktreeUrl: leads.linktreeUrl,
            discoverySource: leads.discoverySource,
            discoveryQuery: leads.discoveryQuery,
            displayName: leads.displayName,
            bio: leads.bio,
            avatarUrl: leads.avatarUrl,
            contactEmail: leads.contactEmail,
            hasPaidTier: leads.hasPaidTier,
            hasSpotifyLink: leads.hasSpotifyLink,
            spotifyUrl: leads.spotifyUrl,
            hasInstagram: leads.hasInstagram,
            instagramHandle: leads.instagramHandle,
            allLinks: leads.allLinks,
            fitScore: leads.fitScore,
            fitScoreBreakdown: leads.fitScoreBreakdown,
            status: leads.status,
            disqualificationReason: leads.disqualificationReason,
            qualifiedAt: leads.qualifiedAt,
            disqualifiedAt: leads.disqualifiedAt,
            approvedAt: leads.approvedAt,
            ingestedAt: leads.ingestedAt,
            rejectedAt: leads.rejectedAt,
            creatorProfileId: leads.creatorProfileId,
            emailInvalid: leads.emailInvalid,
            emailSuspicious: leads.emailSuspicious,
            emailInvalidReason: leads.emailInvalidReason,
            hasRepresentation: leads.hasRepresentation,
            representationSignal: leads.representationSignal,
            outreachRoute: leads.outreachRoute,
            outreachStatus: leads.outreachStatus,
            claimToken: leads.claimToken,
            claimTokenHash: leads.claimTokenHash,
            claimTokenExpiresAt: leads.claimTokenExpiresAt,
            instantlyLeadId: leads.instantlyLeadId,
            outreachQueuedAt: leads.outreachQueuedAt,
            dmSentAt: leads.dmSentAt,
            dmCopy: leads.dmCopy,
            scrapedAt: leads.scrapedAt,
            createdAt: leads.createdAt,
            updatedAt: leads.updatedAt,
          })
          .from(leads)
          .where(whereClause)
          .orderBy(desc(leads.createdAt))
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(leads).where(whereClause),
        db.select({ total: count() }).from(leads).where(pendingWhereClause),
      ]);
    }

    return NextResponse.json(
      {
        items: rows,
        total: totalRow?.total ?? 0,
        pendingTotal: pendingTotalRow?.total ?? 0,
        page,
        limit,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Failed to list outreach leads', error, {
      route: '/api/admin/outreach',
    });
    return NextResponse.json(
      { error: getSafeErrorMessage(error, 'Failed to list outreach leads') },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * POST /api/admin/outreach — Queue a limited batch of pending outreach emails.
 */
export async function POST(request: NextRequest) {
  const authError = await requireAdminAccess();
  if (authError) {
    return authError;
  }

  try {
    const parsed = await parseJsonBody(request, {
      route: 'POST /api/admin/outreach',
      headers: NO_STORE_HEADERS,
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const validated = queueOutreachBodySchema.safeParse(parsed.data);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validated.error.flatten() },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { limit } = validated.data;
    const now = new Date();
    const claimCutoff = new Date(now.getTime() - OUTREACH_QUEUE_CLAIM_TTL_MS);
    const pendingEmailWhereClause = getPendingEmailWhereClause(now);

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
      .limit(limit);

    let attempted = 0;
    let queued = 0;
    let failed = 0;

    for (const lead of pendingEmailLeads) {
      const claimedAt = new Date();
      const [claimedLead] = await db
        .update(leads)
        .set({
          outreachQueuedAt: claimedAt,
          updatedAt: claimedAt,
        })
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

      if (!claimedLead) {
        continue;
      }

      attempted++;

      try {
        const instantlyLeadId = await pushLeadToInstantly({
          email: lead.contactEmail!,
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
            updatedAt: claimedAt,
          })
          .where(eq(leads.id, lead.id));

        queued++;
      } catch (error) {
        failed++;
        await db
          .update(leads)
          .set({
            outreachQueuedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(leads.id, lead.id));
        await captureError('Manual outreach queue failed', error, {
          route: '/api/admin/outreach',
          contextData: { leadId: lead.id },
        });
      }
    }

    const [remainingPending] = await db
      .select({ total: count() })
      .from(leads)
      .where(pendingEmailWhereClause);

    return NextResponse.json(
      {
        ok: true,
        attempted,
        queued,
        failed,
        remainingPending: Number(remainingPending?.total ?? 0),
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Failed to queue outreach leads', error, {
      route: '/api/admin/outreach',
    });
    return NextResponse.json(
      { error: getSafeErrorMessage(error, 'Failed to queue outreach leads') },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * PATCH /api/admin/outreach — Toggle campaign settings (e.g. campaignsEnabled).
 */
export async function PATCH(request: NextRequest) {
  const authError = await requireAdminAccess();
  if (authError) {
    return authError;
  }

  try {
    const parsed = await parseJsonBody(request, {
      route: 'PATCH /api/admin/outreach',
      headers: NO_STORE_HEADERS,
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = parsed.data as Record<string, unknown>;
    if (typeof body.campaignsEnabled !== 'boolean') {
      return jsonError('campaignsEnabled must be a boolean', 400);
    }

    await db
      .update(campaignSettings)
      .set({
        campaignsEnabled: body.campaignsEnabled,
        updatedAt: new Date(),
      })
      .where(eq(campaignSettings.id, 1));

    return NextResponse.json(
      { ok: true, campaignsEnabled: body.campaignsEnabled },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Failed to update campaign settings', error, {
      route: '/api/admin/outreach',
    });
    return NextResponse.json(
      {
        error: getSafeErrorMessage(error, 'Failed to update campaign settings'),
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
