import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { creatorProfiles } from '@/lib/db/schema';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { parseJsonBody } from '@/lib/http/parse-json';
import { enqueueLinktreeIngestionJob } from '@/lib/ingestion/jobs';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { IngestionStatusManager } from '@/lib/ingestion/status-manager';
import { logger } from '@/lib/utils/logger';
import { normalizeUrl } from '@/lib/utils/platform-detection';
import { ingestionRerunSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

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

    const parsedBody = await parseJsonBody<unknown>(request, {
      route: 'POST /api/admin/creator-ingest/rerun',
      headers: NO_STORE_HEADERS,
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const body = parsedBody.data;
    const parsed = ingestionRerunSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    return await withSystemIngestionSession(async tx => {
      const [profile] = await tx
        .select({
          id: creatorProfiles.id,
          username: creatorProfiles.username,
          usernameNormalized: creatorProfiles.usernameNormalized,
        })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.id, parsed.data.profileId))
        .limit(1);

      if (!profile) {
        return NextResponse.json(
          { error: 'Creator profile not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      const sourceUrl = normalizeUrl(
        `https://linktr.ee/${profile.usernameNormalized ?? profile.username}`
      );

      const jobId = await enqueueLinktreeIngestionJob({
        creatorProfileId: profile.id,
        sourceUrl,
      });

      if (!jobId) {
        return NextResponse.json(
          { error: 'Unable to queue ingestion job' },
          { status: 500, headers: NO_STORE_HEADERS }
        );
      }

      await IngestionStatusManager.markPending(tx, profile.id);

      return NextResponse.json(
        {
          ok: true,
          jobId,
          profile: {
            id: profile.id,
            username: profile.username,
          },
        },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    });
  } catch (error) {
    logger.error('Failed to rerun ingestion job', error);
    return NextResponse.json(
      { error: 'Failed to queue ingestion job' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
