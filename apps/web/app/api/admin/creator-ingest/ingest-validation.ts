import { NextResponse } from 'next/server';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { parseJsonBody } from '@/lib/http/parse-json';
import { creatorIngestSchema } from '@/lib/validation/schemas';
import { NO_STORE_HEADERS } from './ingest-constants';

type ValidationSuccess = {
  ok: true;
  data: {
    url: string;
  };
};

type ValidationFailure = {
  ok: false;
  response: NextResponse;
};

export type ValidationResult = ValidationSuccess | ValidationFailure;

export async function validateIngestRequest(
  request: Request
): Promise<ValidationResult> {
  const entitlements = await getCurrentUserEntitlements();
  if (!entitlements.isAuthenticated) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      ),
    };
  }

  if (!entitlements.isAdmin) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: NO_STORE_HEADERS }
      ),
    };
  }

  const parsedBody = await parseJsonBody<unknown>(request, {
    route: 'POST /api/admin/creator-ingest',
    headers: NO_STORE_HEADERS,
  });
  if (!parsedBody.ok) {
    return { ok: false, response: parsedBody.response };
  }

  const parsed = creatorIngestSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400, headers: NO_STORE_HEADERS }
      ),
    };
  }

  return { ok: true, data: parsed.data };
}
