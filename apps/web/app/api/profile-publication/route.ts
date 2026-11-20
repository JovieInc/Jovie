import { NextResponse } from 'next/server';
import { readProfilePublished } from '@/lib/profile/publication-read';
import { isProfilePublicationCandidate } from '@/lib/routing/profile-publication-edge';
import { logger } from '@/lib/utils/logger';

/**
 * Diagnostic view of the fresh publication decision the proxy's profile gate
 * makes in-process (lib/routing/profile-publication-edge.ts, JOV-8629 §6.2).
 * Every answer reads storage and is no-store; a storage failure is a 503.
 */
const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function GET(req: Request) {
  const username = (new URL(req.url).searchParams.get('username') ?? '')
    .trim()
    .toLowerCase();
  if (!isProfilePublicationCandidate(username)) {
    return NextResponse.json(
      { published: false },
      { headers: NO_STORE, status: 400 }
    );
  }

  try {
    return NextResponse.json(
      { published: await readProfilePublished(username) },
      { headers: NO_STORE }
    );
  } catch (error) {
    logger.error(
      'Profile publication decision failed',
      { error, username },
      'public-profile'
    );
    return NextResponse.json(
      { error: 'unavailable' },
      { headers: NO_STORE, status: 503 }
    );
  }
}
