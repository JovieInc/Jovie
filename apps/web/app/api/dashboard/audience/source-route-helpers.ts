import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { BASE_URL, getProfileUrl } from '@/constants/domains';
import type { DbOrTransaction } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { slugify } from '@/lib/utm/build-url';

export const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
export const AUDIENCE_SOURCE_PAGE_SIZE = 100;

export async function parseSourceRequestJson(
  request: NextRequest
): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error('Malformed JSON');
  }
}

export function buildAudienceSourceShortLinkUrl(code: string): string {
  return new URL(`/s/${code}`, BASE_URL).toString();
}

export function withAudienceSourceShortLink<
  T extends { readonly code: string },
>(link: T): T & { shortUrl: string } {
  return {
    ...link,
    shortUrl: buildAudienceSourceShortLinkUrl(link.code),
  };
}

export function buildAudienceSourceUtmParams(
  groupName: string,
  linkName: string
) {
  return {
    source: 'qr_code',
    medium: 'print',
    campaign: slugify(groupName),
    content: slugify(linkName),
  };
}

export async function resolveAudienceSourceDestinationUrl(
  tx: DbOrTransaction,
  profileId: string
): Promise<string> {
  const [profileRow] = await tx
    .select({ username: creatorProfiles.username })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, profileId))
    .limit(1);

  return profileRow?.username ? getProfileUrl(profileRow.username) : BASE_URL;
}
