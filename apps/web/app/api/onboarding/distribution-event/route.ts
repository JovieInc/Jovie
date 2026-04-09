import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withDbSessionTx } from '@/lib/auth/session';
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
import { uuidSchema } from '@/lib/validation/schemas/base';

const distributionEventSchema = z.object({
  eventType: z.enum(CREATOR_DISTRIBUTION_EVENT_TYPES),
  metadata: z.record(z.string(), z.unknown()).optional(),
  platform: z.literal(INSTAGRAM_DISTRIBUTION_PLATFORM),
  profileId: uuidSchema,
});

function isMissingCreatorDistributionEventsTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .toLowerCase()
    .includes('relation "creator_distribution_events" does not exist');
}

export async function POST(request: Request) {
  try {
    return await withDbSessionTx(async (tx, clerkUserId) => {
      const parsedBody = await parseJsonBody<unknown>(request, {
        headers: NO_STORE_HEADERS,
        route: 'POST /api/onboarding/distribution-event',
      });
      if (!parsedBody.ok) {
        return parsedBody.response;
      }

      const parsed = distributionEventSchema.safeParse(parsedBody.data);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid distribution event payload' },
          { headers: NO_STORE_HEADERS, status: 400 }
        );
      }

      const { eventType, metadata, platform, profileId } = parsed.data;
      const profile = await getAuthenticatedProfile(tx, profileId, clerkUserId);
      if (!profile) {
        return NextResponse.json(
          { error: 'Profile not found' },
          { headers: NO_STORE_HEADERS, status: 404 }
        );
      }

      try {
        await tx
          .insert(creatorDistributionEvents)
          .values({
            createdAt: new Date(),
            creatorProfileId: profileId,
            dedupeKey: buildDistributionDedupeKey(
              profileId,
              platform,
              eventType
            ),
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
    });
  } catch (error) {
    captureError('Error recording creator distribution event', error, {
      route: '/api/onboarding/distribution-event',
    });

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { headers: NO_STORE_HEADERS, status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { headers: NO_STORE_HEADERS, status: 500 }
    );
  }
}
