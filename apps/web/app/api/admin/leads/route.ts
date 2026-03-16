import {
  and,
  asc,
  count,
  desc,
  sql as drizzleSql,
  eq,
  ilike,
  or,
} from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { leads } from '@/lib/db/schema/leads';
import { sqlArray } from '@/lib/db/sql-helpers';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import {
  captureError,
  captureWarning,
  getSafeErrorMessage,
} from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import { processLeadBatch } from '@/lib/leads/process-batch';
import { seedLeadFromUrl } from '@/lib/leads/url-intake';
import {
  leadListQuerySchema,
  manualLeadSubmitSchema,
} from '@/lib/validation/lead-schemas';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export const runtime = 'nodejs';

function toIsoStringOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function getLeadSortColumn(sortBy: string) {
  if (sortBy === 'fitScore') return leads.fitScore;
  if (sortBy === 'priorityScore') return leads.priorityScore;
  if (sortBy === 'displayName') return leads.displayName;
  return leads.createdAt;
}

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

function isMissingLeadInsertColumnError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  return (
    normalized.includes(
      'column "spotify_popularity" of relation "leads" does not exist'
    ) ||
    normalized.includes(
      'column "spotify_followers" of relation "leads" does not exist'
    ) ||
    normalized.includes(
      'column "release_count" of relation "leads" does not exist'
    ) ||
    normalized.includes(
      'column "latest_release_date" of relation "leads" does not exist'
    ) ||
    normalized.includes(
      'column "priority_score" of relation "leads" does not exist'
    ) ||
    normalized.includes(
      'column "is_linktree_verified" of relation "leads" does not exist'
    )
  );
}

async function insertLeadWithLegacyFallback(seed: {
  handle: string;
  normalizedUrl: string;
  hasSpotifyLink: boolean;
  spotifyUrl: string | null;
  hasInstagram: boolean;
  instagramHandle: string | null;
  kind: string;
}): Promise<string | null> {
  const legacyMusicToolsDetected =
    seed.kind === 'apple_music' ? ['apple_music'] : [];

  const result = await db.execute<{ id: string }>(drizzleSql`
    insert into "leads" (
      "linktree_handle",
      "linktree_url",
      "discovery_source",
      "has_spotify_link",
      "spotify_url",
      "has_instagram",
      "instagram_handle",
      "music_tools_detected"
    ) values (
      ${seed.handle},
      ${seed.normalizedUrl},
      ${'manual'},
      ${seed.hasSpotifyLink},
      ${seed.spotifyUrl},
      ${seed.hasInstagram},
      ${seed.instagramHandle},
      ${sqlArray(legacyMusicToolsDetected)}
    )
    returning "id"
  `);

  return result.rows[0]?.id ?? null;
}
/**
 * GET /api/admin/leads — List leads with filtering, search, sort, pagination.
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
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const query = leadListQuerySchema.parse(params);

    const conditions = [];
    if (query.status) {
      conditions.push(eq(leads.status, query.status));
    }
    if (query.search) {
      conditions.push(
        or(
          ilike(leads.linktreeHandle, `%${query.search}%`),
          ilike(leads.displayName, `%${query.search}%`)
        )
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const orderColumn = getLeadSortColumn(query.sortBy);

    const orderFn = query.sortOrder === 'asc' ? asc : desc;

    let items;
    let totalRow;

    try {
      [items, [totalRow]] = await Promise.all([
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
            musicToolsDetected: leads.musicToolsDetected,
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
            spotifyPopularity: leads.spotifyPopularity,
            spotifyFollowers: leads.spotifyFollowers,
            releaseCount: leads.releaseCount,
            latestReleaseDate: leads.latestReleaseDate,
            priorityScore: leads.priorityScore,
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
          .where(where)
          .orderBy(orderFn(orderColumn))
          .limit(query.limit)
          .offset((query.page - 1) * query.limit),
        db.select({ count: count() }).from(leads).where(where),
      ]);
    } catch (error) {
      if (!isMissingLeadEnrichmentColumnError(error)) {
        throw error;
      }

      await captureWarning(
        '[admin/leads] leads enrichment columns missing; falling back to legacy select',
        error,
        { route: '/api/admin/leads' }
      );

      [items, [totalRow]] = await Promise.all([
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
          .where(where)
          .orderBy(desc(leads.createdAt))
          .limit(query.limit)
          .offset((query.page - 1) * query.limit),
        db.select({ count: count() }).from(leads).where(where),
      ]);
    }

    const normalizedItems = items.map(item => {
      const latestReleaseDate =
        'latestReleaseDate' in item && item.latestReleaseDate instanceof Date
          ? item.latestReleaseDate
          : null;

      return {
        ...item,
        hasSpotifyLink: item.hasSpotifyLink ?? false,
        hasInstagram: item.hasInstagram ?? false,
        musicToolsDetected:
          'musicToolsDetected' in item ? (item.musicToolsDetected ?? []) : [],
        spotifyPopularity:
          'spotifyPopularity' in item ? (item.spotifyPopularity ?? null) : null,
        spotifyFollowers:
          'spotifyFollowers' in item ? (item.spotifyFollowers ?? null) : null,
        releaseCount:
          'releaseCount' in item ? (item.releaseCount ?? null) : null,
        priorityScore:
          'priorityScore' in item ? (item.priorityScore ?? null) : null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        qualifiedAt: toIsoStringOrNull(item.qualifiedAt),
        disqualifiedAt: toIsoStringOrNull(item.disqualifiedAt),
        approvedAt: toIsoStringOrNull(item.approvedAt),
        ingestedAt: toIsoStringOrNull(item.ingestedAt),
        rejectedAt: toIsoStringOrNull(item.rejectedAt),
        latestReleaseDate: toIsoStringOrNull(latestReleaseDate),
        scrapedAt: toIsoStringOrNull(item.scrapedAt),
        outreachQueuedAt: toIsoStringOrNull(item.outreachQueuedAt),
        claimTokenExpiresAt: toIsoStringOrNull(item.claimTokenExpiresAt),
        dmSentAt: toIsoStringOrNull(item.dmSentAt),
      };
    });

    return NextResponse.json(
      {
        items: normalizedItems,
        total: totalRow?.count ?? 0,
        page: query.page,
        limit: query.limit,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Failed to list leads', error, {
      route: '/api/admin/leads',
    });
    return NextResponse.json(
      { error: getSafeErrorMessage(error, 'Failed to list leads') },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

type LeadProcessResult = {
  url: string;
  status: 'created' | 'duplicate' | 'invalid';
  reason?: string;
};

async function insertLeadOrFallback(
  seed: Awaited<ReturnType<typeof seedLeadFromUrl>>
): Promise<string | null> {
  if (!seed) return null;
  try {
    const [inserted] = await db
      .insert(leads)
      .values({
        linktreeHandle: seed.handle,
        linktreeUrl: seed.normalizedUrl,
        discoverySource: 'manual',
        hasSpotifyLink: seed.hasSpotifyLink,
        spotifyUrl: seed.spotifyUrl,
        hasInstagram: seed.hasInstagram,
        instagramHandle: seed.instagramHandle,
        musicToolsDetected: seed.kind === 'apple_music' ? ['apple_music'] : [],
      })
      .returning({ id: leads.id });
    return inserted?.id ?? null;
  } catch (error) {
    if (!isMissingLeadInsertColumnError(error)) throw error;
    await captureWarning(
      '[admin/leads] leads insert columns missing; falling back to legacy insert',
      error,
      { route: '/api/admin/leads', handle: seed.handle }
    );
    return insertLeadWithLegacyFallback(seed);
  }
}

async function processLeadUrl(
  url: string
): Promise<{ result: LeadProcessResult; leadId: string | null }> {
  const seed = seedLeadFromUrl(url);
  if (!seed) {
    return {
      result: { url, status: 'invalid', reason: 'Invalid URL' },
      leadId: null,
    };
  }

  const [existing] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(eq(leads.linktreeHandle, seed.handle))
    .limit(1);

  if (existing) {
    return { result: { url, status: 'duplicate' }, leadId: null };
  }

  const leadId = await insertLeadOrFallback(seed);
  const result: LeadProcessResult = leadId
    ? { url, status: 'created' }
    : { url, status: 'invalid', reason: 'Insert failed' };
  return { result, leadId };
}

/**
 * POST /api/admin/leads — Manual URL submission (single or batch).
 * Inserts new leads as 'discovered', then triggers qualification.
 */
export async function POST(request: NextRequest) {
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
    const parsed = await parseJsonBody(request, {
      route: '/api/admin/leads',
    });
    if (!parsed.ok) return parsed.response;

    const validated = manualLeadSubmitSchema.safeParse(parsed.data);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validated.error.flatten() },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const results: LeadProcessResult[] = [];
    const newLeadIds: string[] = [];

    for (const url of validated.data.urls) {
      const { result, leadId } = await processLeadUrl(url);
      results.push(result);
      if (leadId) newLeadIds.push(leadId);
    }

    // Trigger qualification for newly created leads
    let qualificationResult = null;
    if (newLeadIds.length > 0) {
      qualificationResult = await processLeadBatch(newLeadIds);
    }

    return NextResponse.json(
      {
        results,
        summary: {
          total: results.length,
          created: results.filter(r => r.status === 'created').length,
          duplicate: results.filter(r => r.status === 'duplicate').length,
          invalid: results.filter(r => r.status === 'invalid').length,
        },
        qualification: qualificationResult,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Failed to submit leads', error, {
      route: '/api/admin/leads',
    });
    return NextResponse.json(
      { error: getSafeErrorMessage(error, 'Failed to submit leads') },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
