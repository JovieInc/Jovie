import { NextResponse } from 'next/server';
import { defineRoute } from '@/lib/api/route-pipeline';
import {
  type SignedInRouteInput,
  signedInAccess,
} from '@/lib/api/signed-in-access';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  toTeleprompterTakeSummary,
  UpdateTeleprompterTakeSchema,
} from '@/lib/teleprompter/takes/contract';
import { teleprompterTakeErrorResponse } from '@/lib/teleprompter/takes/route-error';
import {
  deleteTeleprompterTake,
  setTeleprompterTakeKept,
} from '@/lib/teleprompter/takes/server';

export const runtime = 'nodejs';

interface RouteParams {
  readonly params: Promise<{ readonly takeId: string }>;
}

const ROUTE = '/api/teleprompter/takes/[takeId]';

export const PATCH = defineRoute(
  { route: ROUTE, access: signedInAccess() },
  async ({ auth, request }: SignedInRouteInput, { params }: RouteParams) => {
    const { takeId } = await params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'invalid-json' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    const parsed = UpdateTeleprompterTakeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid-take-update' },
        { status: 422, headers: NO_STORE_HEADERS }
      );
    }
    try {
      const record = await setTeleprompterTakeKept(
        auth.userId,
        takeId,
        parsed.data.kept
      );
      return NextResponse.json(
        { take: toTeleprompterTakeSummary(record) },
        { headers: NO_STORE_HEADERS }
      );
    } catch (error) {
      return teleprompterTakeErrorResponse(error, ROUTE);
    }
  }
);

export const DELETE = defineRoute(
  { route: ROUTE, access: signedInAccess() },
  async ({ auth }: SignedInRouteInput, { params }: RouteParams) => {
    const { takeId } = await params;
    try {
      await deleteTeleprompterTake(auth.userId, takeId);
      return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
    } catch (error) {
      return teleprompterTakeErrorResponse(error, ROUTE);
    }
  }
);
