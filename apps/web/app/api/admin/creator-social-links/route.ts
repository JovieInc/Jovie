import { and, asc, eq, not } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { socialLinks } from '@/lib/db/schema';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

type SocialLinkRow = {
  id: string;
  label: string;
  url: string;
  platform: string;
  platformType: string;
};

export async function GET(request: NextRequest) {
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

    const profileId = request.nextUrl.searchParams.get('profileId');
    if (!profileId) {
      return NextResponse.json(
        { error: 'profileId is required' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const rows = await db
      .select({
        id: socialLinks.id,
        label: socialLinks.displayText,
        url: socialLinks.url,
        platform: socialLinks.platform,
        platformType: socialLinks.platformType,
      })
      .from(socialLinks)
      .where(
        and(
          eq(socialLinks.creatorProfileId, profileId),
          not(eq(socialLinks.state, 'rejected'))
        )
      )
      .orderBy(asc(socialLinks.sortOrder));

    const mapped: SocialLinkRow[] = rows.map(row => ({
      id: row.id,
      label: row.label ?? row.platform ?? 'Link',
      url: row.url,
      platform: row.platform,
      platformType: row.platformType,
    }));

    return NextResponse.json(
      { success: true, links: mapped },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Admin creator social links error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load social links' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
