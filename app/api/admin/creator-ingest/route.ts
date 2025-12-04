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
  isLinktreeUrl,
} from '@/lib/ingestion/strategies/linktree';
import { normalizeUrl } from '@/lib/utils/platform-detection';

const ingestSchema = z.object({
  url: z.string().url(),
});

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = ingestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid URL' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const normalizedUrl = normalizeUrl(parsed.data.url);
    if (!isLinktreeUrl(normalizedUrl)) {
      return NextResponse.json(
        { error: 'Only Linktree profiles are supported right now.' },
        { status: 400 }
      );
    }

    const handle = extractLinktreeHandle(normalizedUrl);
    if (!handle) {
      return NextResponse.json(
        { error: 'Unable to parse Linktree handle from URL.' },
        { status: 422 }
      );
    }

    const usernameNormalized = handle.toLowerCase();

    return await withSystemIngestionSession(async tx => {
      const [existing] = await tx
        .select({ id: creatorProfiles.id })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.usernameNormalized, usernameNormalized))
        .limit(1);

      if (existing) {
        return NextResponse.json(
          { error: 'A creator profile with that handle already exists' },
          { status: 409 }
        );
      }

      const html = await fetchLinktreeDocument(normalizedUrl);
      const extraction = extractLinktree(html);
      const displayName = extraction.displayName?.trim() || handle;
      const avatarUrl = extraction.avatarUrl?.trim() || null;

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
          settings: {},
          theme: {},
          ingestionStatus: 'processing',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({
          id: creatorProfiles.id,
          username: creatorProfiles.username,
          usernameNormalized: creatorProfiles.usernameNormalized,
          displayName: creatorProfiles.displayName,
          avatarUrl: creatorProfiles.avatarUrl,
        });

      if (!created) {
        return NextResponse.json(
          { error: 'Failed to create creator profile' },
          { status: 500 }
        );
      }

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

      await tx
        .update(creatorProfiles)
        .set({ ingestionStatus: 'idle', updatedAt: new Date() })
        .where(eq(creatorProfiles.id, created.id));

      return NextResponse.json(
        {
          ok: true,
          profile: {
            id: created.id,
            username: created.username,
            usernameNormalized: created.usernameNormalized,
          },
          links: extraction.links.length,
        },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    });
  } catch (error) {
    console.error('Admin ingestion failed', error);
    return NextResponse.json(
      { error: 'Failed to ingest Linktree profile' },
      { status: 500 }
    );
  }
}
