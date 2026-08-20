import { actionChannelSchema } from '@jovie/action-contracts';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { resolveActionCapabilities } from '@/lib/actions/capabilities';
import { getCachedAuth } from '@/lib/auth/cached';
import { withDbSessionTx } from '@/lib/auth/session';
import { creatorContacts, creatorProfiles } from '@/lib/db/schema/profiles';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
} as const;

const discoveryQuerySchema = z.object({
  profileId: z.uuid(),
  channel: actionChannelSchema,
  clientVersion: z.string().min(1).max(64).optional(),
});

/**
 * Canonical Actions discovery (contract phase 2).
 *
 * Authenticated, read-only capability resolution:
 * `GET /api/v1/actions?profileId=<owned-profile>&channel=<channel>[&clientVersion=<semver>]`.
 * Advisory UX only — invocation repeats every check server-side.
 * `clientVersion` is evaluated against `minimumClientVersions[channel]`;
 * gated actions resolve as `CLIENT_UPGRADE_REQUIRED`.
 */
export async function GET(req: Request) {
  try {
    const { userId } = await getCachedAuth();
    if (!userId) {
      return NextResponse.json(
        {
          error: {
            code: 'AUTH_REQUIRED',
            messageKey: 'errors.actions.authRequired',
            retryable: false,
          },
        },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const { searchParams } = new URL(req.url);
    const parsedQuery = discoveryQuerySchema.safeParse({
      profileId: searchParams.get('profileId'),
      channel: searchParams.get('channel'),
      clientVersion: searchParams.get('clientVersion') ?? undefined,
    });
    if (!parsedQuery.success) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            messageKey: 'errors.actions.invalidDiscoveryQuery',
            retryable: false,
          },
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { profileId, channel, clientVersion } = parsedQuery.data;

    const scope = await withDbSessionTx(async (tx, appUserId) => {
      const [profile] = await tx
        .select({ id: creatorProfiles.id })
        .from(creatorProfiles)
        .where(
          and(
            eq(creatorProfiles.id, profileId),
            eq(creatorProfiles.userId, appUserId)
          )
        )
        .limit(1);

      if (!profile) {
        return null;
      }

      const contacts = await tx
        .select({ id: creatorContacts.id })
        .from(creatorContacts)
        .where(eq(creatorContacts.creatorProfileId, profileId));

      return { profileId: profile.id, contactCount: contacts.length };
    });

    if (!scope) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            messageKey: 'errors.actions.profileNotOwned',
            retryable: false,
          },
        },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const entitlements = await getCurrentUserEntitlements();

    const actions = resolveActionCapabilities({
      entitlements,
      channel,
      clientVersion,
      profileOwned: true,
      quotaUsage: { contactsLimit: scope.contactCount },
    });

    return NextResponse.json({ actions }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    captureError('Actions discovery failed', error);
    logger.error('Actions discovery failed', { error });
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL',
          messageKey: 'errors.actions.discoveryFailed',
          retryable: true,
        },
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
