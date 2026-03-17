import { sql as drizzleSql, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { withDbSession } from '@/lib/auth/session';
import { invalidateProfileCache } from '@/lib/cache/profile';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { parseJsonBody } from '@/lib/http/parse-json';
import { getShopifyUrl, isShopifyDomain } from '@/lib/profile/shop-settings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function getProfileForUser(clerkUserId: string) {
  const [result] = await db
    .select({
      id: creatorProfiles.id,
      username: creatorProfiles.username,
      usernameNormalized: creatorProfiles.usernameNormalized,
      settings: creatorProfiles.settings,
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  return result ?? null;
}

export async function GET() {
  try {
    return await withDbSession(async clerkUserId => {
      const profile = await getProfileForUser(clerkUserId);
      if (!profile) {
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      const settings =
        (profile.settings as Record<string, unknown> | null) ?? {};
      const shopifyUrl = getShopifyUrl(settings);

      return NextResponse.json({ shopifyUrl }, { headers: NO_STORE_HEADERS });
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    captureError('Error reading shop settings', error, {
      route: 'GET /api/dashboard/shop',
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function PUT(req: Request) {
  try {
    return await withDbSession(async clerkUserId => {
      const parsedBody = await parseJsonBody<{
        shopifyUrl?: string | null;
      }>(req, {
        route: 'PUT /api/dashboard/shop',
        headers: NO_STORE_HEADERS,
      });
      if (!parsedBody.ok) {
        return parsedBody.response;
      }

      const { shopifyUrl } = parsedBody.data ?? {};

      // Validate: null/empty clears the setting, non-empty must be valid
      if (shopifyUrl && !isShopifyDomain(shopifyUrl)) {
        return NextResponse.json(
          {
            error:
              'Invalid Shopify URL. Please use your *.myshopify.com store URL.',
          },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const profile = await getProfileForUser(clerkUserId);
      if (!profile) {
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      // Atomic JSONB merge to avoid TOCTOU race on concurrent settings writes
      const mergeValue = shopifyUrl || null;
      await db
        .update(creatorProfiles)
        .set({
          settings: drizzleSql`COALESCE(${creatorProfiles.settings}, '{}'::jsonb) || ${JSON.stringify({ shopifyUrl: mergeValue })}::jsonb`,
          updatedAt: new Date(),
        })
        .where(eq(creatorProfiles.id, profile.id));

      // Invalidate public profile cache so the shop icon appears/disappears
      await invalidateProfileCache(profile.usernameNormalized);

      return NextResponse.json(
        { ok: true, shopifyUrl: shopifyUrl || null },
        { headers: NO_STORE_HEADERS }
      );
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    captureError('Error saving shop settings', error, {
      route: 'PUT /api/dashboard/shop',
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
