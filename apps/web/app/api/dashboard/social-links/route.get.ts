import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { withDbSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { getAuthenticatedProfile } from '@/lib/db/queries/shared';
import { creatorProfiles, socialLinks } from '@/lib/db/schema';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

export async function GET(req: Request) {
  try {
    return await withDbSession(async clerkUserId => {
      const url = new URL(req.url);
      const profileId = url.searchParams.get('profileId');
      if (!profileId) {
        return NextResponse.json(
          { error: 'Profile ID is required' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const profile = await getAuthenticatedProfile(db, profileId, clerkUserId);
      if (!profile) {
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      const rows = await db
        .select({
          profileId: creatorProfiles.id,
          linkId: socialLinks.id,
          platform: socialLinks.platform,
          platformType: socialLinks.platformType,
          url: socialLinks.url,
          sortOrder: socialLinks.sortOrder,
          isActive: socialLinks.isActive,
          displayText: socialLinks.displayText,
          state: socialLinks.state,
          confidence: socialLinks.confidence,
          sourcePlatform: socialLinks.sourcePlatform,
          sourceType: socialLinks.sourceType,
          evidence: socialLinks.evidence,
          version: socialLinks.version,
        })
        .from(creatorProfiles)
        .leftJoin(
          socialLinks,
          eq(socialLinks.creatorProfileId, creatorProfiles.id)
        )
        .where(eq(creatorProfiles.id, profileId))
        .orderBy(socialLinks.sortOrder);

      const links = rows
        .filter(r => r.linkId !== null)
        .map(r => {
          const state =
            (r.state as 'active' | 'suggested' | 'rejected' | null) ??
            (r.isActive ? 'active' : 'suggested');
          if (state === 'rejected') return null;

          const parsedConfidence =
            typeof r.confidence === 'number'
              ? r.confidence
              : Number.parseFloat(String(r.confidence ?? '0'));

          return {
            id: r.linkId!,
            platform: r.platform!,
            platformType: r.platformType!,
            url: r.url!,
            sortOrder: r.sortOrder!,
            isActive: state === 'active',
            displayText: r.displayText,
            state,
            confidence: Number.isFinite(parsedConfidence)
              ? parsedConfidence
              : 0,
            sourcePlatform: r.sourcePlatform,
            sourceType: r.sourceType ?? 'manual',
            evidence: r.evidence,
            version: r.version ?? 1,
          };
        })
        .filter((link): link is NonNullable<typeof link> => Boolean(link));

      return NextResponse.json(
        { links },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    });
  } catch (error) {
    captureError('Error fetching social links', error, {
      route: '/api/dashboard/social-links',
      action: 'fetch',
    });
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
