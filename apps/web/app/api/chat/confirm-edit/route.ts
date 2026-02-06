import { auth } from '@clerk/nextjs/server';
import * as Sentry from '@sentry/nextjs';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
// eslint-disable-next-line no-restricted-imports -- Direct schema imports, not barrel
import { chatAuditLog } from '@/lib/db/schema/chat';
// eslint-disable-next-line no-restricted-imports -- Direct schema imports, not barrel
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { NO_CACHE_HEADERS } from '@/lib/http/headers';
import { getClientIP } from '@/lib/rate-limit';
import { logger } from '@/lib/utils/logger';

/**
 * Schema for validating the edit request body
 */
const confirmEditSchema = z.object({
  profileId: z.string().uuid(),
  field: z.enum(['displayName', 'bio', 'genres']),
  newValue: z.union([z.string(), z.array(z.string())]),
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
  const { userId } = await auth();
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

  // Validate field-specific value types
  if (field === 'genres' && !Array.isArray(newValue)) {
    return NextResponse.json(
      { error: 'Genres must be an array' },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }
  if (field !== 'genres' && typeof newValue !== 'string') {
    return NextResponse.json(
      { error: `${field} must be a string` },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  try {
    // Fetch the profile and verify ownership
    const profile = await db.query.creatorProfiles.findFirst({
      where: eq(creatorProfiles.id, profileId),
      columns: {
        id: true,
        userId: true,
        displayName: true,
        bio: true,
        genres: true,
      },
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

    // Get the old value for audit logging
    const oldValue = profile[field];

    // Apply the update
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
      userId,
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
