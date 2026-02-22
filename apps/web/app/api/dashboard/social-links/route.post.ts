import { resolveTxt } from 'node:dns/promises';
import { and, eq, ne } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { withDbSessionTx } from '@/lib/auth/session';
import { getAuthenticatedProfile } from '@/lib/db/queries/shared';
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
        {
          error: 'Profile ID and link ID are required',
          code: 'missing_params',
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const profile = await getAuthenticatedProfile(tx, profileId, clerkUserId);
    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found', code: 'profile_not_found' },
        { status: 404, headers: NO_STORE_HEADERS }
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
        { error: 'Website link not found', code: 'link_not_found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    if (!link.verificationToken) {
      return NextResponse.json(
        {
          error: 'This website link is missing a verification token.',
          code: 'missing_token',
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const hostname = extractHostname(link.url);
    if (!hostname) {
      return NextResponse.json(
        { error: 'Invalid website URL', code: 'invalid_url' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Check if another profile already has this domain verified
    const claimCandidates = await tx
      .select({
        id: socialLinks.id,
        url: socialLinks.url,
      })
      .from(socialLinks)
      .where(
        and(
          eq(socialLinks.platform, 'website'),
          eq(socialLinks.verificationStatus, 'verified'),
          ne(socialLinks.creatorProfileId, profileId)
        )
      )
      .limit(100);

    const claimedByOther = claimCandidates.some(candidate => {
      const candidateHostname = extractHostname(candidate.url);
      return candidateHostname === hostname;
    });

    if (claimedByOther) {
      return NextResponse.json(
        {
          ok: false,
          status: 'pending',
          code: 'domain_already_claimed',
          error: 'This domain has already been verified by another account.',
        },
        { status: 409, headers: NO_STORE_HEADERS }
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

    if (verified) {
      return NextResponse.json(
        {
          ok: true,
          status: 'verified',
          code: 'verified',
          verificationToken: link.verificationToken,
        },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        status: 'pending',
        code: 'dns_not_found',
        error:
          'DNS TXT record not found yet. DNS changes can take up to 48 hours to propagate.',
        verificationToken: link.verificationToken,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  });
}
