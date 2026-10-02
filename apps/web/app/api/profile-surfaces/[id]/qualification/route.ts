import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  isUnauthorizedSessionError,
  withDbSessionTx,
} from '@/lib/auth/session';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { parseJsonBody } from '@/lib/http/parse-json';
import {
  PROFILE_IDENTITY_DECISIONS,
  qualifyProfileSurface,
} from '@/lib/profile-surfaces/qualification';

export const runtime = 'nodejs';

const paramsSchema = z.object({ id: z.string().uuid() });
const requestSchema = z.object({
  decision: z.enum(PROFILE_IDENTITY_DECISIONS),
});

export async function POST(
  request: Request,
  { params }: { readonly params: Promise<{ readonly id: string }> }
) {
  try {
    return await withDbSessionTx(async (tx, appUserId) => {
      const parsedParams = paramsSchema.safeParse(await params);
      const parsedBody = await parseJsonBody<unknown>(request, {
        route: 'POST /api/profile-surfaces/[id]/qualification',
        headers: NO_STORE_HEADERS,
      });
      if (!parsedBody.ok) return parsedBody.response;

      const parsedRequest = requestSchema.safeParse(parsedBody.data);
      if (!parsedParams.success || !parsedRequest.success) {
        return NextResponse.json(
          { ok: false, error: 'Invalid identity decision' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const result = await qualifyProfileSurface(tx, {
        surfaceId: parsedParams.data.id,
        actorUserId: appUserId,
        decision: parsedRequest.data.decision,
      });
      if (!result.ok) {
        const status = result.reason === 'not_found' ? 404 : 409;
        return NextResponse.json(
          { ok: false, error: result.reason },
          { status, headers: NO_STORE_HEADERS }
        );
      }

      return NextResponse.json(result, {
        status: 200,
        headers: NO_STORE_HEADERS,
      });
    });
  } catch (error) {
    if (isUnauthorizedSessionError(error)) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    await captureError('Presence identity confirmation failed', error, {
      route: '/api/profile-surfaces/[id]/qualification',
      method: 'POST',
    });
    return NextResponse.json(
      { ok: false, error: 'Unable to save identity decision' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
