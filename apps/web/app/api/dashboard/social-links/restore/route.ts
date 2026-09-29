import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { parseJsonBody } from '@/lib/http/parse-json';
import { restoreSocialLinksSnapshot } from '@/lib/security/account-security';
import { extractClientIP } from '@/lib/utils/ip-extraction';

export const runtime = 'nodejs';

const restoreSchema = z.object({
  profileId: z.string().uuid(),
  snapshotId: z.string().uuid(),
});

// POST /api/dashboard/social-links/restore — audited one-click revert
// to a known-good snapshot (JOV-6600). The current set is captured as a
// `pre_restore` snapshot first, so the revert is itself reversible.
export async function POST(req: NextRequest) {
  const { userId } = await getCachedAuth();
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const parsedBody = await parseJsonBody<unknown>(req, {
    route: 'POST /api/dashboard/social-links/restore',
    headers: NO_STORE_HEADERS,
  });
  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const parsed = restoreSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'profileId and snapshotId are required' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const result = await restoreSocialLinksSnapshot({
      appUserId: userId,
      profileId: parsed.data.profileId,
      snapshotId: parsed.data.snapshotId,
      ipAddress: extractClientIP(req.headers),
      userAgent: req.headers.get('user-agent'),
    });

    return NextResponse.json(
      { ok: true, ...result },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'Profile not found' || message === 'Snapshot not found') {
      return NextResponse.json(
        { error: message },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }
    void captureError('Social links restore failed', error, {
      source: 'api/dashboard/social-links/restore',
    });
    return NextResponse.json(
      { error: 'Unable to restore links right now.' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
