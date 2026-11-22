import { NextResponse } from 'next/server';
import {
  type OperatorRouteInput,
  operatorAccess,
} from '@/lib/api/route-access';
import { defineRoute } from '@/lib/api/route-pipeline';
import { readReviewInboxPilotCase } from '@/lib/ovie/review-inbox/pilot-ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function getHandler(_input: OperatorRouteInput) {
  return NextResponse.json({ case: readReviewInboxPilotCase() });
}

export const GET = defineRoute(
  {
    route: '/api/ovie/review-inbox/pilot',
    access: operatorAccess({ session: 'fresh' }),
  },
  getHandler
);
