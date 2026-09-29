import { NextResponse } from 'next/server';
import { getCachedAuth } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  computeSecurityScore,
  getSecurityOverview,
} from '@/lib/security/account-security';

export const runtime = 'nodejs';

// GET /api/account/security/overview — powers the security card
// (JOV-6600): protections, score, recent sign-ins, audited events.
export async function GET() {
  const { userId } = await getCachedAuth();
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const overview = await getSecurityOverview(userId);
    if (!overview) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const { score, factors } = computeSecurityScore(overview);

    return NextResponse.json(
      { ...overview, score, factors },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    void captureError('Failed to load security overview', error, {
      source: 'api/account/security/overview',
    });
    return NextResponse.json(
      { error: 'Unable to load security status right now.' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
