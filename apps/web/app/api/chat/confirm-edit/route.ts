import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { chatAuditLog } from '@/lib/db/schema/chat';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { CORS_HEADERS } from '@/lib/http/headers';

/**
 * Schema for validating the edit request body
 */
const confirmEditSchema = z.object({
  profileId: z.string().uuid(),
  field: z.enum(['displayName', 'bio', 'genres']),
  newValue: z.union([z.string(), z.array(z.string())]),
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
      { status: 401, headers: CORS_HEADERS }
    );
  }

  // Parse and validate request body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const parseResult = confirmEditSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parseResult.error.flatten() },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const { profileId, field, newValue } = parseResult.data;

  // Validate field-specific value types
  if (field === 'genres' && !Array.isArray(newValue)) {
    return NextResponse.json(
      { error: 'Genres must be an array' },
      { status: 400, headers: CORS_HEADERS }
    );
  }
  if (field !== 'genres' && typeof newValue !== 'string') {
    return NextResponse.json(
      { error: `${field} must be a string` },
      { status: 400, headers: CORS_HEADERS }
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
        { status: 404, headers: CORS_HEADERS }
      );
    }

    if (profile.userId !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized - not your profile' },
        { status: 403, headers: CORS_HEADERS }
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

    // Log to audit table
    await db.insert(chatAuditLog).values({
      userId,
      creatorProfileId: profileId,
      action: 'profile_edit',
      field,
      previousValue: JSON.stringify(oldValue),
      newValue: JSON.stringify(newValue),
    });

    return NextResponse.json(
      {
        success: true,
        field,
        newValue,
      },
      { headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error('[confirm-edit] Error applying edit:', error);
    return NextResponse.json(
      { error: 'Failed to apply edit' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
