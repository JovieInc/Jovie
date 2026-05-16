import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { extractAndPropose } from '@/lib/connectors/extract-and-propose';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/dev/connectors/extract-now
 *
 * LOCAL-ONLY dev endpoint. Triggers `extractAndPropose` for the authenticated user.
 * Used by the "Extract now" dev button in /settings/connectors.
 *
 * Gated by `process.env.NODE_ENV !== 'production'`.
 */
export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Not available in production' },
      { status: 403 }
    );
  }

  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [dbUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    logger.info('[dev/connectors/extract-now] Triggering extractAndPropose', {
      userId: dbUser.id,
    });

    const created = await extractAndPropose(dbUser.id);

    return NextResponse.json({ ok: true, suggestedActionsCreated: created });
  } catch (error) {
    logger.error('[dev/connectors/extract-now] Error', { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
