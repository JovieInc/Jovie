import * as Sentry from '@sentry/nextjs';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import { chatToolSchema } from '@/lib/chat/strict-schema';
import { db } from '@/lib/db';
import { chatAuditLog } from '@/lib/db/schema/chat';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { NO_CACHE_HEADERS } from '@/lib/http/headers';
import {
  getMerchProductOptions,
  publishMerchCard,
  selectMerchDesign,
  updateMerchCardStatus,
} from '@/lib/merch/service';
import { getClientIP } from '@/lib/rate-limit';
import { logger } from '@/lib/utils/logger';

const confirmMerchStatusActionSchema = chatToolSchema({
  profileId: z.string().uuid(),
  merchCardId: z.string().uuid(),
  action: z.enum(['publish', 'archive', 'unpause', 'pause']),
});

const confirmMerchSelectSchema = chatToolSchema({
  profileId: z.string().uuid(),
  generationId: z.string().uuid(),
  optionId: z.string().uuid(),
  optionNumber: z.number().int().min(1).max(4),
  catalogProductId: z.number().int().positive(),
  action: z.literal('select'),
});

const confirmMerchProductsSchema = chatToolSchema({
  profileId: z.string().uuid(),
  generationId: z.string().uuid(),
  optionId: z.string().uuid(),
  optionNumber: z.number().int().min(1).max(4),
  action: z.literal('products'),
});

const confirmMerchActionSchema = z.union([
  confirmMerchSelectSchema,
  confirmMerchProductsSchema,
  confirmMerchStatusActionSchema,
]);

const AUDIT_ACTION_BY_CONFIRM = {
  select: 'select_merch',
  publish: 'publish_merch',
  archive: 'archive_merch',
  unpause: 'unpause_merch',
  pause: 'pause_merch',
} as const;

export async function POST(req: Request) {
  const { userId } = await getCachedAuth();
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_CACHE_HEADERS }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  const parseResult = confirmMerchActionSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parseResult.error.flatten() },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  const { profileId, action } = parseResult.data;

  try {
    const profile = await db.query.creatorProfiles.findFirst({
      where: eq(creatorProfiles.id, profileId),
      columns: { id: true, userId: true },
    });

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404, headers: NO_CACHE_HEADERS }
      );
    }

    if (profile.userId !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized - not your profile' },
        { status: 403, headers: NO_CACHE_HEADERS }
      );
    }

    if (action === 'products') {
      const products = await getMerchProductOptions({
        generationId: parseResult.data.generationId,
        clerkUserId: userId,
        profileId,
        optionId: parseResult.data.optionId,
        optionNumber: parseResult.data.optionNumber,
      });
      return NextResponse.json(
        { success: true, products },
        { headers: NO_CACHE_HEADERS }
      );
    }

    if (action === 'select') {
      const result = await selectMerchDesign({
        generationId: parseResult.data.generationId,
        clerkUserId: userId,
        profileId,
        optionId: parseResult.data.optionId,
        optionNumber: parseResult.data.optionNumber,
        catalogProductId: parseResult.data.catalogProductId,
        publish: false,
      });

      if (!result.product) {
        throw new Error('Selected merch product state unavailable');
      }

      const ipAddress = getClientIP(req);
      const userAgent = req.headers.get('user-agent');

      await db.insert(chatAuditLog).values({
        userId,
        creatorProfileId: profileId,
        action: AUDIT_ACTION_BY_CONFIRM[action],
        field: 'merch_selection',
        previousValue: null,
        newValue: JSON.stringify({
          merchCardId: result.merchCardId,
          selectedOptionId: result.selectedOptionId,
          catalogProductId: parseResult.data.catalogProductId,
          status: result.status,
        }),
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      });

      return NextResponse.json(result, { headers: NO_CACHE_HEADERS });
    }

    const { merchCardId } = parseResult.data;
    const card =
      action === 'publish'
        ? await publishMerchCard({
            cardId: merchCardId,
            profileId,
            clerkUserId: userId,
          })
        : await updateMerchCardStatus({
            cardId: merchCardId,
            profileId,
            clerkUserId: userId,
            status:
              action === 'archive'
                ? 'archived'
                : action === 'pause'
                  ? 'paused'
                  : 'live',
          });

    const ipAddress = getClientIP(req);
    const userAgent = req.headers.get('user-agent');

    await db.insert(chatAuditLog).values({
      userId,
      creatorProfileId: profileId,
      action: AUDIT_ACTION_BY_CONFIRM[action],
      field: 'merch_status',
      previousValue: null,
      newValue: JSON.stringify({
        merchCardId: card.id,
        status: card.status,
        title: card.title,
      }),
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });

    return NextResponse.json(
      {
        success: true,
        merchCardId: card.id,
        status: card.status,
        title: card.title,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error) {
    logger.error('[confirm-merch-action] Error applying merch action:', error);
    Sentry.captureException(error, {
      tags: { feature: 'ai-chat', operation: 'confirm-merch-action' },
      extra: {
        userId,
        profileId,
        action,
        merchCardId:
          'merchCardId' in parseResult.data
            ? parseResult.data.merchCardId
            : undefined,
        generationId:
          'generationId' in parseResult.data
            ? parseResult.data.generationId
            : undefined,
      },
    });
    return NextResponse.json(
      { error: 'Failed to apply merch action' },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
