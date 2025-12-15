import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  AdminAuthError,
  getAdminAuthStatusCode,
  requireAdmin,
} from '@/lib/admin/require-admin';
import { creatorProfiles } from '@/lib/db/schema';
import { enqueueLinktreeIngestionJob } from '@/lib/ingestion/jobs';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { normalizeUrl } from '@/lib/utils/platform-detection';

const rerunSchema = z.object({
  profileId: z.string().uuid(),
});

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    await requireAdmin();

    const body = await request.json().catch(() => null);
    const parsed = rerunSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
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
          { status: 404 }
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
          { status: 500 }
        );
      }

      await tx
        .update(creatorProfiles)
        .set({ ingestionStatus: 'pending', updatedAt: new Date() })
        .where(eq(creatorProfiles.id, profile.id));

      return NextResponse.json(
        {
          ok: true,
          jobId,
          profile: {
            id: profile.id,
            username: profile.username,
          },
        },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json(
        { error: error.message },
        {
          status: getAdminAuthStatusCode(error.code),
          headers: { 'Cache-Control': 'no-store' },
        }
      );
    }

    console.error('Failed to rerun ingestion job', error);
    return NextResponse.json(
      { error: 'Failed to queue ingestion job' },
      { status: 500 }
    );
  }
}
