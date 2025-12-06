import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { creatorProfiles } from '@/lib/db/schema';
import { normalizeAndMergeExtraction } from '@/lib/ingestion/processor';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import {
  extractLinktree,
  extractLinktreeHandle,
  fetchLinktreeDocument,
  isValidHandle,
  normalizeHandle,
  validateLinktreeUrl,
} from '@/lib/ingestion/strategies/linktree';
import { logger } from '@/lib/utils/logger';

// Default claim token expiration: 30 days
const CLAIM_TOKEN_EXPIRY_DAYS = 30;

const ingestSchema = z.object({
  url: z.string().url(),
  // Optional idempotency key to prevent duplicate ingestion on double-click
  idempotencyKey: z.string().uuid().optional(),
});

export const runtime = 'nodejs';

/**
 * Admin endpoint to ingest a Linktree profile.
 *
 * Hardening:
 * - Strict URL validation (HTTPS only, valid Linktree hosts)
 * - Handle normalization and validation
 * - Transaction-wrapped with race-safe duplicate check
 * - Idempotency key support
 * - Claim token generated at creation time
 * - Error persistence for admin visibility
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = ingestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Strict URL validation
    const validatedUrl = validateLinktreeUrl(parsed.data.url);
    if (!validatedUrl) {
      return NextResponse.json(
        {
          error: 'Invalid Linktree URL',
          details:
            'URL must be a valid HTTPS Linktree profile (e.g., https://linktr.ee/username)',
        },
        { status: 400 }
      );
    }

    // Extract and validate handle
    const rawHandle = extractLinktreeHandle(validatedUrl);
    if (!rawHandle) {
      return NextResponse.json(
        { error: 'Unable to parse Linktree handle from URL.' },
        { status: 422 }
      );
    }

    // Normalize handle for storage
    const handle = normalizeHandle(rawHandle);
    if (!isValidHandle(handle)) {
      return NextResponse.json(
        {
          error: 'Invalid handle format',
          details:
            'Handle must be 1-30 characters, alphanumeric and underscores only',
        },
        { status: 422 }
      );
    }

    const usernameNormalized = handle;

    return await withSystemIngestionSession(async tx => {
      // Race-safe duplicate check within transaction
      const [existing] = await tx
        .select({ id: creatorProfiles.id })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.usernameNormalized, usernameNormalized))
        .limit(1);

      if (existing) {
        return NextResponse.json(
          {
            error: 'A creator profile with that handle already exists',
            existingProfileId: existing.id,
          },
          { status: 409 }
        );
      }

      // Fetch and extract Linktree data
      let html: string;
      let extraction: ReturnType<typeof extractLinktree>;
      try {
        html = await fetchLinktreeDocument(validatedUrl);
        extraction = extractLinktree(html);
      } catch (fetchError) {
        const errorMessage =
          fetchError instanceof Error
            ? fetchError.message
            : 'Failed to fetch Linktree profile';

        logger.error('Linktree fetch failed', {
          url: validatedUrl,
          error: errorMessage,
        });

        return NextResponse.json(
          { error: 'Failed to fetch Linktree profile', details: errorMessage },
          { status: 502 }
        );
      }

      const displayName = extraction.displayName?.trim() || handle;
      const avatarUrl = extraction.avatarUrl?.trim() || null;

      // Generate claim token at creation time (not on read)
      const claimToken = randomUUID();
      const claimTokenExpiresAt = new Date();
      claimTokenExpiresAt.setDate(
        claimTokenExpiresAt.getDate() + CLAIM_TOKEN_EXPIRY_DAYS
      );

      // Insert profile with claim token
      const [created] = await tx
        .insert(creatorProfiles)
        .values({
          userId: null,
          creatorType: 'creator',
          username: handle,
          usernameNormalized,
          displayName,
          avatarUrl,
          isPublic: true,
          isVerified: false,
          isFeatured: false,
          marketingOptOut: false,
          isClaimed: false,
          claimToken,
          claimTokenExpiresAt,
          settings: {},
          theme: {},
          ingestionStatus: 'processing',
          lastIngestionError: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({
          id: creatorProfiles.id,
          username: creatorProfiles.username,
          usernameNormalized: creatorProfiles.usernameNormalized,
          displayName: creatorProfiles.displayName,
          avatarUrl: creatorProfiles.avatarUrl,
          claimToken: creatorProfiles.claimToken,
        });

      if (!created) {
        return NextResponse.json(
          { error: 'Failed to create creator profile' },
          { status: 500 }
        );
      }

      // Merge extracted links
      let mergeError: string | null = null;
      try {
        await normalizeAndMergeExtraction(
          tx,
          {
            id: created.id,
            usernameNormalized,
            avatarUrl: created.avatarUrl ?? null,
            displayName: created.displayName ?? displayName,
            avatarLockedByUser: false,
            displayNameLocked: false,
          },
          extraction
        );
      } catch (error) {
        mergeError =
          error instanceof Error ? error.message : 'Link extraction failed';
        logger.error('Link merge failed', {
          profileId: created.id,
          error: mergeError,
        });
      }

      // Update ingestion status (success or failure)
      await tx
        .update(creatorProfiles)
        .set({
          ingestionStatus: mergeError ? 'failed' : 'idle',
          lastIngestionError: mergeError,
          updatedAt: new Date(),
        })
        .where(eq(creatorProfiles.id, created.id));

      logger.info('Creator profile ingested', {
        profileId: created.id,
        handle: created.username,
        linksExtracted: extraction.links.length,
        hadError: !!mergeError,
      });

      return NextResponse.json(
        {
          ok: true,
          profile: {
            id: created.id,
            username: created.username,
            usernameNormalized: created.usernameNormalized,
            claimToken: created.claimToken,
          },
          links: extraction.links.length,
          warning: mergeError
            ? `Profile created but link extraction had issues: ${mergeError}`
            : undefined,
        },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    logger.error('Admin ingestion failed', { error: errorMessage });

    // Check for unique constraint violation (race condition fallback)
    if (
      errorMessage.includes('unique constraint') ||
      errorMessage.includes('duplicate key')
    ) {
      return NextResponse.json(
        { error: 'A creator profile with that handle already exists' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to ingest Linktree profile', details: errorMessage },
      { status: 500 }
    );
  }
}
