/**
 * POST /api/authority/wiki-page-draft
 *
 * Build platform-specific wiki / Genius page drafts from claimed graph context.
 * Pure draft generation — never publishes. Wikipedia responses always flag
 * humanGateRequired.
 *
 * GH #14651.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/require-auth';
import {
  AUTHORITY_PAGE_PLATFORMS,
  type AuthorityPagePlatform,
  buildAuthorityPageDraft,
} from '@/lib/authority';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
} as const;

const collabSchema = z.object({
  name: z.string().min(1),
  context: z.string().nullable().optional(),
  unlinkedMention: z.boolean().optional(),
  sourceUrl: z.string().url().nullable().optional(),
});

const releaseSchema = z.object({
  title: z.string().min(1),
  year: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
});

const pressSchema = z.object({
  title: z.string().min(1),
  outlet: z.string().nullable().optional(),
  url: z.string().url().nullable().optional(),
  confirmed: z.boolean().optional(),
});

const requestSchema = z.object({
  platform: z.enum(AUTHORITY_PAGE_PLATFORMS),
  artistName: z.string().min(1).max(200),
  aliases: z.array(z.string().min(1)).max(20).optional(),
  bio: z.string().max(4000).nullable().optional(),
  genres: z.array(z.string().min(1)).max(20).optional(),
  releases: z.array(releaseSchema).max(50).optional(),
  collabs: z.array(collabSchema).max(50).optional(),
  confirmedPress: z.array(pressSchema).max(50).optional(),
  jovieUsername: z.string().max(100).nullable().optional(),
});

export async function POST(request: Request) {
  const { userId, error } = await requireAuth();
  if (error) return error;

  try {
    const json: unknown = await request.json();
    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const body = parsed.data;
    const platform = body.platform as AuthorityPagePlatform;
    const draft = buildAuthorityPageDraft(platform, {
      artistName: body.artistName,
      aliases: body.aliases,
      bio: body.bio,
      genres: body.genres,
      releases: body.releases,
      collabs: body.collabs,
      confirmedPress: body.confirmedPress,
      jovieUsername: body.jovieUsername,
    });

    logger.info('[authority/wiki-page-draft] drafted page', {
      userId,
      platform: draft.platform,
      humanGateRequired: draft.humanGateRequired,
    });

    return NextResponse.json(
      { ok: true as const, draft },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    logger.error('[authority/wiki-page-draft] draft failed', err);
    await captureError('Authority wiki page draft failed', err, {
      route: '/api/authority/wiki-page-draft',
      method: 'POST',
    });
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
