import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { BASE_URL } from '@/constants/app';
import { getCachedAuth } from '@/lib/auth/cached';
import {
  getExactProfileAccess,
  isCanonicalUuid,
} from '@/lib/auth/profile-access';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { creatorProfileRiders } from '@/lib/db/schema/riders';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  createRiderLinkToken,
  hashRiderPassword,
} from '@/lib/rider/access.server';
import { riderPutSchema } from '@/lib/rider/schema';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RiderRow = typeof creatorProfileRiders.$inferSelect;

const json = (body: object, status: number) =>
  NextResponse.json(body, { status, headers: NO_STORE_HEADERS });

async function getProfileSummary(profileId: string) {
  const [profile] = await db
    .select({
      username: creatorProfiles.username,
      displayName: creatorProfiles.displayName,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, profileId))
    .limit(1);
  return profile ?? null;
}

function riderResponse(rider: RiderRow | null, username: string | null) {
  const token =
    rider?.visibility === 'link_only'
      ? createRiderLinkToken(rider.creatorProfileId)
      : null;
  return {
    rider: {
      technical: rider?.technical ?? [],
      hospitality: rider?.hospitality ?? [],
      visibility: rider?.visibility ?? ('private' as const),
      hasPassword: Boolean(rider?.passwordHash),
    },
    version: rider?.version ?? 0,
    shareUrl:
      token && username
        ? `${BASE_URL}/api/rider/${username}?token=${token}`
        : null,
  };
}

async function denied(profileId: string) {
  const { userId } = await getCachedAuth();
  if (!userId) return json({ error: 'Unauthorized' }, 401);
  const access = await getExactProfileAccess(db, userId, profileId);
  if (!access.ok) return json({ error: 'Forbidden' }, 403);
  return null;
}

const conflict = (currentVersion: number, expectedVersion?: number) =>
  json(
    {
      error: 'This rider was updated elsewhere. Refresh and try again.',
      code: 'VERSION_CONFLICT',
      currentVersion,
      expectedVersion,
    },
    409
  );

async function loadRider(profileId: string) {
  const [rider] = await db
    .select()
    .from(creatorProfileRiders)
    .where(eq(creatorProfileRiders.creatorProfileId, profileId))
    .limit(1);
  return rider ?? null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const profileId = url.searchParams.get('profileId');
  if (!isCanonicalUuid(profileId)) {
    return json({ error: 'A valid profileId is required' }, 400);
  }
  const authError = await denied(profileId);
  if (authError) return authError;

  const [rider, profile] = await Promise.all([
    loadRider(profileId),
    getProfileSummary(profileId),
  ]);
  return json(riderResponse(rider, profile?.username ?? null), 200);
}

export async function PUT(request: Request) {
  const parsed = riderPutSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return json({ error: 'Invalid rider payload' }, 400);
  }
  const { profileId, expectedVersion, rider: input } = parsed.data;

  const authError = await denied(profileId);
  if (authError) return authError;

  const passwordHash =
    input.password === undefined
      ? undefined
      : input.password === null
        ? null
        : hashRiderPassword(input.password);

  try {
    const [existing, profile] = await Promise.all([
      loadRider(profileId),
      getProfileSummary(profileId),
    ]);

    if (!existing) {
      if (expectedVersion !== undefined && expectedVersion !== 0) {
        return conflict(0, expectedVersion);
      }
      const inserted = await db
        .insert(creatorProfileRiders)
        .values({
          creatorProfileId: profileId,
          technical: input.technical,
          hospitality: input.hospitality,
          visibility: input.visibility,
          ...(passwordHash !== undefined ? { passwordHash } : {}),
          version: 1,
        })
        .onConflictDoNothing()
        .returning();
      const rider = inserted[0] ?? (await loadRider(profileId));
      if (!rider || (!inserted[0] && expectedVersion !== undefined)) {
        return conflict(rider?.version ?? 0, expectedVersion);
      }
      return json(riderResponse(rider, profile?.username ?? null), 200);
    }

    if (expectedVersion !== undefined && existing.version !== expectedVersion) {
      return conflict(existing.version, expectedVersion);
    }

    // CAS: the version predicate makes the compare-and-swap atomic.
    const updated = await db
      .update(creatorProfileRiders)
      .set({
        technical: input.technical,
        hospitality: input.hospitality,
        visibility: input.visibility,
        ...(passwordHash !== undefined ? { passwordHash } : {}),
        version: drizzleSql`${creatorProfileRiders.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(creatorProfileRiders.id, existing.id),
          eq(creatorProfileRiders.version, existing.version)
        )
      )
      .returning();

    if (!updated[0]) {
      return conflict(
        (await loadRider(profileId))?.version ?? 0,
        expectedVersion
      );
    }
    return json(riderResponse(updated[0], profile?.username ?? null), 200);
  } catch (error) {
    logger.error('Rider update failed:', error);
    await captureError('Rider update failed', error, {
      route: '/api/dashboard/rider',
      method: 'PUT',
    });
    return json({ error: 'Failed to update rider' }, 500);
  }
}
