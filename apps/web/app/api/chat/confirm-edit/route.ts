import * as Sentry from '@sentry/nextjs';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import { getOwnedChatProfile } from '@/lib/chat/profile-ownership';
import { db } from '@/lib/db';
import { chatAuditLog } from '@/lib/db/schema/chat';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { NO_CACHE_HEADERS } from '@/lib/http/headers';
import { getClientIP } from '@/lib/rate-limit';
import { logger } from '@/lib/utils/logger';

/**
 * Schema for validating the edit request body
 */
const confirmEditSchema = z.object({
  profileId: z.string().uuid(),
  field: z.enum(['displayName', 'bio']),
  newValue: z.string(),
  conversationId: z.string().uuid().optional(),
  messageId: z.string().uuid().optional(),
});

/**
 * POST /api/chat/confirm-edit
 *
 * Applies a confirmed profile edit from the chat interface.
 * Validates ownership, applies the change, and logs to audit table.
 */
export async function POST(req: Request) {
  // Auth check
  const { userId } = await getCachedAuth();
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_CACHE_HEADERS }
    );
  }

  // Parse and validate request body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  const parseResult = confirmEditSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parseResult.error.flatten() },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  const { profileId, field, newValue, conversationId, messageId } =
    parseResult.data;

  try {
    const profile = await getOwnedChatProfile({
      profileId,
      clerkUserId: userId,
    });

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404, headers: NO_CACHE_HEADERS }
      );
    }

    const oldValue =
      field === 'displayName' ? profile.displayName : profile.bio;

    await db
      .update(creatorProfiles)
      .set({
        [field]: newValue,
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, profileId));

    // Log to audit table with full traceability
    const ipAddress = getClientIP(req);
    const userAgent = req.headers.get('user-agent');

    await db.insert(chatAuditLog).values({
      userId: profile.internalUserId,
      creatorProfileId: profileId,
      conversationId: conversationId ?? null,
      messageId: messageId ?? null,
      action: 'profile_edit',
      field,
      previousValue: JSON.stringify(oldValue),
      newValue: JSON.stringify(newValue),
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });

    return NextResponse.json(
      {
        success: true,
        field,
        newValue,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error) {
    logger.error('[confirm-edit] Error applying edit:', error);
    Sentry.captureException(error, {
      tags: { feature: 'ai-chat', operation: 'confirm-edit' },
      extra: { userId, profileId, field },
    });
    return NextResponse.json(
      { error: 'Failed to apply edit' },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
