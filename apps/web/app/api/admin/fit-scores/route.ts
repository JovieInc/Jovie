/**
 * Admin API for Fit Score Management
 *
 * Provides endpoints for:
 * - GET: Retrieve top-scoring unclaimed profiles for GTM outreach
 * - POST: Trigger fit score recalculation or Spotify enrichment
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import {
  calculateMissingFitScores,
  enrichMissingSpotifyData,
  getEnrichmentQueue,
  getTopFitProfiles,
  recalculateAllFitScores,
} from '@/lib/fit-scoring';
import { parseJsonBody } from '@/lib/http/parse-json';
import {
  checkAdminFitScoresRateLimit,
  createRateLimitHeaders,
} from '@/lib/rate-limit';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * GET /api/admin/fit-scores
 *
 * Query params:
 * - limit: Max profiles to return (default: 50, max: 200)
 * - minScore: Minimum fit score threshold (default: 0)
 * - action: "queue" to get enrichment queue status
 */
export async function GET(request: Request) {
  try {
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

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // Return enrichment queue status
    if (action === 'queue') {
      const queue = await getEnrichmentQueue(db, 20);
      return NextResponse.json(
        {
          ok: true,
          enrichmentQueue: {
            total: queue.total,
            sample: queue.sample,
          },
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    // Default: return top fit profiles
    const limit = Math.min(
      200,
      Math.max(1, Number.parseInt(searchParams.get('limit') ?? '50', 10) || 50)
    );
    const minScore = Math.max(
      0,
      Number.parseInt(searchParams.get('minScore') ?? '0', 10) || 0
    );

    const profiles = await getTopFitProfiles(db, limit, minScore);

    return NextResponse.json(
      {
        ok: true,
        count: profiles.length,
        profiles: profiles.map(p => ({
          id: p.id,
          username: p.username,
          displayName: p.displayName,
          fitScore: p.fitScore,
          breakdown: p.fitScoreBreakdown,
          spotifyUrl: p.spotifyUrl,
          source: p.ingestionSourcePlatform,
        })),
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Admin fit scores GET failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch fit scores',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

const postActionSchema = z.object({
  action: z.enum(['recalculate', 'recalculate_all', 'enrich_spotify']),
  limit: z.number().int().min(1).max(500).optional(),
});

/**
 * POST /api/admin/fit-scores
 *
 * Body:
 * - action: "recalculate" (missing scores only), "recalculate_all", or "enrich_spotify"
 * - limit: Max profiles to process (default: 100)
 */
export async function POST(request: Request) {
  try {
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

    // Rate limiting - prevents runaway compute from repeated recalculations
    const rateLimitResult = await checkAdminFitScoresRateLimit(
      entitlements.userId!
    );
    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: rateLimitResult.reason,
          retryAfter: Math.ceil(
            (rateLimitResult.reset.getTime() - Date.now()) / 1000
          ),
        },
        {
          status: 429,
          headers: {
            ...NO_STORE_HEADERS,
            ...createRateLimitHeaders(rateLimitResult),
          },
        }
      );
    }

    const parsedBody = await parseJsonBody<unknown>(request, {
      route: 'POST /api/admin/fit-scores',
      headers: NO_STORE_HEADERS,
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }

    const parsed = postActionSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { action, limit = 100 } = parsed.data;

    switch (action) {
      case 'recalculate': {
        const count = await calculateMissingFitScores(db, limit);
        return NextResponse.json(
          {
            ok: true,
            action: 'recalculate',
            profilesScored: count,
          },
          { headers: NO_STORE_HEADERS }
        );
      }

      case 'recalculate_all': {
        const count = await recalculateAllFitScores(db, limit);
        return NextResponse.json(
          {
            ok: true,
            action: 'recalculate_all',
            profilesScored: count,
          },
          { headers: NO_STORE_HEADERS }
        );
      }

      case 'enrich_spotify': {
        const results = await enrichMissingSpotifyData(db, limit);
        const successful = results.filter(r => r.enriched).length;
        const failed = results.filter(r => !r.success).length;

        return NextResponse.json(
          {
            ok: true,
            action: 'enrich_spotify',
            processed: results.length,
            enriched: successful,
            failed,
            results: results.slice(0, 20), // Sample for debugging
          },
          { headers: NO_STORE_HEADERS }
        );
      }

      default:
        return NextResponse.json(
          { error: 'Unknown action' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
    }
  } catch (error) {
    logger.error('Admin fit scores POST failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to process fit scores action',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
