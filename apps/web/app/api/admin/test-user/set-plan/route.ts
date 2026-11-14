/**
 * POST /api/admin/test-user/set-plan
 *
 * Admin-only compatibility endpoint. For E2E flows, use
 * `/api/dev/test-user/set-plan` instead.
 */

import { NextResponse } from 'next/server';

import { operatorAccess } from '@/lib/api/route-access';
import { defineRoute } from '@/lib/api/route-pipeline';

async function postHandler() {
  return NextResponse.json(
    {
      error:
        'Deprecated endpoint. Use /api/dev/test-user/set-plan for authenticated test-user plan changes.',
    },
    { status: 410 }
  );
}

export const POST = defineRoute(
  {
    route: '/api/admin/test-user/set-plan',
    access: operatorAccess({ session: 'fresh' }),
    legacy: { cache: 'none', unhandledErrors: 'rethrow' },
  },
  postHandler
);
