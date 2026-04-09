import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  isUnauthorizedSessionError,
  withDbSessionTx,
} from '@/lib/auth/session';
import { db } from '@/lib/db';
import { unwrapPgError } from '@/lib/db/errors';
import { getAuthenticatedProfile } from '@/lib/db/queries/shared';
import { creatorDistributionEvents } from '@/lib/db/schema/profiles';
import {
  buildDistributionDedupeKey,
  CREATOR_DISTRIBUTION_EVENT_TYPES,
  INSTAGRAM_DISTRIBUTION_PLATFORM,
} from '@/lib/distribution/instagram-activation';
import { captureError, captureWarning } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { parseJsonBody } from '@/lib/http/parse-json';
import { logger } from '@/lib/utils/logger';
import { uuidSchema } from '@/lib/validation/schemas/base';

const distributionEventSchema = z.object({
  eventType: z.enum(CREATOR_DISTRIBUTION_EVENT_TYPES),
  metadata: z.record(z.string(), z.unknown()).optional(),
  platform: z.literal(INSTAGRAM_DISTRIBUTION_PLATFORM),
  profileId: uuidSchema,
});

type DistributionEventRequest = z.infer<typeof distributionEventSchema>;

type DistributionEventResolution =
  | { kind: 'response'; response: Response }
  | { kind: 'event'; payload: DistributionEventRequest };

function isMissingCreatorDistributionEventsTableError(error: unknown): boolean {
  return unwrapPgError(error).code === '42P01';
}

export async function POST(request: Request) {
  try {
    const result: DistributionEventResolution = await withDbSessionTx(
      async (tx, clerkUserId) => {
        const parsedBody = await parseJsonBody<unknown>(request, {
          headers: NO_STORE_HEADERS,
          route: 'POST /api/onboarding/distribution-event',
        });
        if (!parsedBody.ok) {
          return { kind: 'response', response: parsedBody.response };
        }

        const parsed = distributionEventSchema.safeParse(parsedBody.data);
        if (!parsed.success) {
          return {
            kind: 'response',
            response: NextResponse.json(
              { error: 'Invalid distribution event payload' },
              { headers: NO_STORE_HEADERS, status: 400 }
            ),
          };
        }

        const profile = await getAuthenticatedProfile(
          tx,
          parsed.data.profileId,
          clerkUserId
        );
        if (!profile) {
          return {
            kind: 'response',
            response: NextResponse.json(
              { error: 'Profile not found' },
              { headers: NO_STORE_HEADERS, status: 404 }
            ),
          };
        }

        return { kind: 'event', payload: parsed.data };
      }
    );

    if (result.kind === 'response') {
      return result.response;
    }

    const { eventType, metadata, platform, profileId } = result.payload;

    try {
      await db
        .insert(creatorDistributionEvents)
        .values({
          createdAt: new Date(),
          creatorProfileId: profileId,
          dedupeKey: buildDistributionDedupeKey(profileId, platform, eventType),
          eventType,
          metadata: metadata ?? {},
          platform,
        })
        .onConflictDoNothing();
    } catch (error) {
      if (isMissingCreatorDistributionEventsTableError(error)) {
        await captureWarning(
          '[onboarding/distribution-event] creator_distribution_events table missing; skipping event write',
          error,
          { eventType, platform, profileId }
        );

        return NextResponse.json(
          { ok: false, skipped: 'missing_table' },
          { headers: NO_STORE_HEADERS, status: 202 }
        );
      }

      throw error;
    }

    return NextResponse.json(
      { ok: true },
      { headers: NO_STORE_HEADERS, status: 200 }
    );
  } catch (error) {
    if (isUnauthorizedSessionError(error)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { headers: NO_STORE_HEADERS, status: 401 }
      );
    }

    logger.error(
      '[onboarding/distribution-event] Failed to record creator distribution event',
      error
    );
    await captureError('Error recording creator distribution event', error, {
      route: '/api/onboarding/distribution-event',
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { headers: NO_STORE_HEADERS, status: 500 }
    );
  }
}
