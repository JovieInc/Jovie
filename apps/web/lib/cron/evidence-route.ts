import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { verifyCronRequest } from './auth';

/**
 * Shared skeleton for a cron-secret-authenticated internal evidence route:
 * verify auth, cap the body size, parse JSON, validate against the
 * caller's own zod schema, then hand off to the caller's handler.
 * Extracted from `certification-evidence/route.ts` after
 * `design-ci-judge-evidence/route.ts` duplicated it closely enough to trip
 * SonarCloud's new-code duplication gate (JOV-6944) — both routes share
 * this now instead of each carrying its own near-identical copy.
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

/**
 * The full route skeleton: auth, size cap, JSON parse, schema validation,
 * then the caller's own handler for the one thing that actually differs
 * between evidence routes — what to do with the validated payload.
 */
export async function handleCronEvidencePost<Schema extends z.ZodType>(
  request: Request,
  options: {
    readonly route: string;
    readonly maxBytes: number;
    readonly schema: Schema;
    readonly invalidLabel: string;
    readonly handle: (data: z.infer<Schema>) => Promise<NextResponse>;
  }
): Promise<NextResponse> {
  const authError = verifyCronRequest(request, { route: options.route });
  if (authError) return authError;

  const parsedBody = await parseBoundedJsonBody(request, options.maxBytes);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = options.schema.safeParse(parsedBody.value);
  if (!parsed.success) {
    return jsonResponse(
      { error: options.invalidLabel, issues: parsed.error.issues.slice(0, 10) },
      400
    );
  }
  return options.handle(parsed.data);
}
