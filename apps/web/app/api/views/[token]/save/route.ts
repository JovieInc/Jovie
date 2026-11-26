import { NextResponse } from 'next/server';
import { defineRoute } from '@/lib/api/route-pipeline';
import { rateLimitBy } from '@/lib/api/route-rate-limit';
import {
  type SignedInRouteInput,
  signedInAccess,
} from '@/lib/api/signed-in-access';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { generalLimiter } from '@/lib/rate-limit';
import {
  PublishViewError,
  saveViewAsDashboard,
} from '@/lib/views/service.server';

export const runtime = 'nodejs';

async function postHandler(
  { auth }: SignedInRouteInput,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  try {
    const result = await saveViewAsDashboard({ token, userId: auth.userId });
    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (err) {
    if (err instanceof PublishViewError && err.code === 'view_not_found') {
      return NextResponse.json({ error: 'View not found' }, { status: 404 });
    }
    throw err;
  }
}

/** Save a shared view into the signed-in viewer's dashboards. */
export const POST = defineRoute(
  {
    route: '/api/views/[token]/save',
    access: signedInAccess(),
    rateLimit: rateLimitBy({
      limiter: generalLimiter,
      key: ({ auth }) => auth.userId,
    }),
    errorMessage: 'Failed to save view',
  },
  postHandler
);
