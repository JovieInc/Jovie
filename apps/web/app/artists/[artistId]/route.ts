import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { artists } from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' } as const;

interface RouteContext {
  readonly params: Promise<{ readonly artistId: string }>;
}

/**
 * Stable artist-entity route.
 *
 * Registry IDs do not change when an unclaimed profile is claimed, merged, or
 * renamed, so collaborator links remain valid while the visible handle can
 * evolve independently.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const { artistId } = await context.params;
  if (!UUID_PATTERN.test(artistId)) {
    return new Response(null, { status: 404, headers: NO_STORE_HEADERS });
  }

  const [resolved] = await db
    .select({ username: creatorProfiles.usernameNormalized })
    .from(artists)
    .innerJoin(
      creatorProfiles,
      eq(artists.creatorProfileId, creatorProfiles.id)
    )
    .where(and(eq(artists.id, artistId), eq(creatorProfiles.isPublic, true)))
    .limit(1);

  if (!resolved?.username) {
    return new Response(null, { status: 404, headers: NO_STORE_HEADERS });
  }

  return NextResponse.redirect(
    new URL(`/${encodeURIComponent(resolved.username)}`, request.url),
    { status: 307, headers: NO_STORE_HEADERS }
  );
}
