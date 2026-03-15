import { and, asc, count, desc, eq, isNotNull } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { leads } from '@/lib/db/schema/leads';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import {
  captureError,
  captureWarning,
  getSafeErrorMessage,
} from '@/lib/error-tracking';
import { outreachListQuerySchema } from '@/lib/validation/lead-schemas';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export const runtime = 'nodejs';

function isMissingLeadEnrichmentColumnError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

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
  const entitlements = await getCurrentUserEntitlements();
  if (!entitlements.isAuthenticated) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }
  if (!entitlements.isAdmin) {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
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

    // Build filter conditions
    const conditions = [isNotNull(leads.outreachRoute)];
    if (queue !== 'all') {
      conditions.push(eq(leads.outreachRoute, queue));
    }

    const whereClause = and(...conditions);

    // Sort
    const sortColumn =
      sort === 'priorityScore' ? leads.priorityScore : leads.createdAt;
    const orderBy = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

    // Query data and count in parallel
    let rows;
    let totalRow;

    try {
      [rows, [totalRow]] = await Promise.all([
        db
          .select()
          .from(leads)
          .where(whereClause)
          .orderBy(orderBy)
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(leads).where(whereClause),
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

      [rows, [totalRow]] = await Promise.all([
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
      ]);
    }

    return NextResponse.json(
      {
        items: rows,
        total: totalRow?.total ?? 0,
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
