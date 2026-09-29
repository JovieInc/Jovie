import { NextResponse } from 'next/server';

/**
 * Shared skeleton for a cron-secret-authenticated internal evidence route:
 * cap the body size, parse JSON, and hand off to the caller's own zod
 * schema. Extracted from `certification-evidence/route.ts` after
 * `design-ci-judge-evidence/route.ts` duplicated it closely enough to trip
 * SonarCloud's new-code duplication gate (JOV-6944) — both routes share
 * this now instead of each carrying its own copy.
 */

export const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export function jsonResponse(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export type BoundedJsonBodyResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly response: NextResponse };

export async function parseBoundedJsonBody(
  request: Request,
  maxBytes: number
): Promise<BoundedJsonBodyResult> {
  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) {
    return {
      ok: false,
      response: jsonResponse({ error: 'payload_too_large' }, 413),
    };
  }
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return {
      ok: false,
      response: jsonResponse({ error: 'invalid_json' }, 400),
    };
  }
}
