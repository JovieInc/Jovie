import { NextResponse } from 'next/server';
import { defineRoute } from '@/lib/api/route-pipeline';
import {
  type SignedInRouteInput,
  signedInAccess,
} from '@/lib/api/signed-in-access';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  SaveTeleprompterTakeSchema,
  toTeleprompterTakeSummary,
} from '@/lib/teleprompter/takes/contract';
import { teleprompterTakeErrorResponse } from '@/lib/teleprompter/takes/route-error';
import {
  listTeleprompterTakes,
  saveTeleprompterTake,
} from '@/lib/teleprompter/takes/server';

export const runtime = 'nodejs';

const ROUTE = '/api/teleprompter/takes';

export const GET = defineRoute(
  { route: ROUTE, access: signedInAccess() },
  async ({ auth }: SignedInRouteInput) => {
    try {
      const takes = await listTeleprompterTakes(auth.userId);
      return NextResponse.json(
        { takes: takes.map(toTeleprompterTakeSummary) },
        { headers: NO_STORE_HEADERS }
      );
    } catch (error) {
      return teleprompterTakeErrorResponse(error, ROUTE);
    }
  }
);

export const POST = defineRoute(
  { route: ROUTE, access: signedInAccess() },
  async ({ auth, request }: SignedInRouteInput) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'invalid-json' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    const parsed = SaveTeleprompterTakeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid-take' },
        { status: 422, headers: NO_STORE_HEADERS }
      );
    }
    try {
      const record = await saveTeleprompterTake(auth.userId, parsed.data);
      return NextResponse.json(
        { take: toTeleprompterTakeSummary(record) },
        { status: 201, headers: NO_STORE_HEADERS }
      );
    } catch (error) {
      return teleprompterTakeErrorResponse(error, ROUTE);
    }
  }
);
