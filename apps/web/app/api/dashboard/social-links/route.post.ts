import { resolveTxt } from 'node:dns/promises';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { withDbSessionTx } from '@/lib/auth/session';
import { getAuthenticatedProfile } from '@/lib/db/queries/shared';
import { getSocialLinksVerificationColumnSupport } from '@/lib/db/queries/social-links-verification';
import { socialLinks } from '@/lib/db/schema/links';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { parseJsonBody } from '@/lib/http/parse-json';

interface VerifyWebsiteBody {
  profileId?: string;
  linkId?: string;
}

function extractHostname(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  return withDbSessionTx(async (tx, clerkUserId) => {
    const body = await parseJsonBody<VerifyWebsiteBody>(req, {
      route: 'POST /api/dashboard/social-links',
      headers: NO_STORE_HEADERS,
    });
    if (!body.ok) return body.response;

    const profileId = body.data.profileId;
    const linkId = body.data.linkId;

    if (!profileId || !linkId) {
      return NextResponse.json(
        { error: 'Profile ID and link ID are required' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const profile = await getAuthenticatedProfile(tx, profileId, clerkUserId);
    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const hasVerificationColumns =
      await getSocialLinksVerificationColumnSupport(tx);
    if (!hasVerificationColumns) {
      return NextResponse.json(
        { error: 'Website verification is temporarily unavailable.' },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }

    const [link] = await tx
      .select({
        id: socialLinks.id,
        platform: socialLinks.platform,
        url: socialLinks.url,
        verificationToken: socialLinks.verificationToken,
      })
      .from(socialLinks)
      .where(
        and(
          eq(socialLinks.id, linkId),
          eq(socialLinks.creatorProfileId, profileId),
          eq(socialLinks.platform, 'website')
        )
      )
      .limit(1);

    if (!link) {
      return NextResponse.json(
        { error: 'Website link not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    if (!link.verificationToken) {
      return NextResponse.json(
        { error: 'This website link is missing a verification token.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const hostname = extractHostname(link.url);
    if (!hostname) {
      return NextResponse.json(
        { error: 'Invalid website URL' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    let verified = false;
    try {
      const records = await resolveTxt(hostname);
      const flattened = records.map(chunks => chunks.join(''));
      verified = flattened.some(record =>
        record.includes(link.verificationToken!)
      );
    } catch {
      verified = false;
    }

    const now = new Date();
    await tx
      .update(socialLinks)
      .set({
        verificationStatus: verified ? 'verified' : 'pending',
        verificationCheckedAt: now,
        verifiedAt: verified ? now : null,
        updatedAt: now,
      })
      .where(eq(socialLinks.id, link.id));

    return NextResponse.json(
      {
        ok: verified,
        status: verified ? 'verified' : 'pending',
        verificationToken: link.verificationToken,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  });
}
