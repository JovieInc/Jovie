/**
 * Access policy for the mesh hub's Vercel Board shadow-mirror receiver
 * (one-week pilot; workers/mesh-hub/BOARD-PILOT.md). Lives outside route.ts
 * because a Next route file may only export handlers.
 *
 * Hard gates, all here so the pipeline owns the response shape:
 * production only + secret set (404), body size (413), ±300 s timestamp
 * window (401), HMAC-SHA256 over `${timestamp}.${rawBody}` timing-safe (401),
 * well-formed rows (400). The raw body is read exactly once — in authorize —
 * because the signature is over the raw bytes; the handler works from the
 * parsed rows the policy returns.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { type AccessPolicy } from '@/lib/api/route-pipeline';
import { env } from '@/lib/env-server';
import { logger } from '@/lib/utils/logger';
import { type HubRow, parseHubRows } from './mapping';

const MAX_BODY_BYTES = 512 * 1024;
const SKEW_MS = 300_000;

export type MirrorAuth = { rows: HubRow[] };

/** The route answers 404 unless production AND the shared secret is set. */
export function mirrorEnabled(): boolean {
  return (
    process.env.VERCEL_ENV === 'production' && Boolean(env.BOARD_MIRROR_SECRET)
  );
}

function signatureMatches(
  secret: string,
  timestamp: string,
  rawBody: string,
  provided: string
): boolean {
  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(provided, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export const mirrorAccess: AccessPolicy<MirrorAuth> = {
  name: 'mesh-hub-mirror-hmac',
  async authorize(request) {
    if (!mirrorEnabled())
      return {
        ok: false,
        status: 404,
        body: { ok: false, code: 'not_found' },
      };
    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES)
      return {
        ok: false,
        status: 413,
        body: { ok: false, code: 'body_too_large' },
      };
    const timestamp = request.headers.get('x-mesh-timestamp') ?? '';
    const provided = request.headers.get('x-mesh-signature') ?? '';
    const ts = Number(timestamp);
    if (
      !timestamp ||
      !Number.isFinite(ts) ||
      Math.abs(Date.now() - ts) > SKEW_MS
    )
      return {
        ok: false,
        status: 401,
        body: { ok: false, code: 'timestamp_skew' },
      };
    if (
      !provided ||
      !signatureMatches(
        env.BOARD_MIRROR_SECRET as string,
        timestamp,
        rawBody,
        provided
      )
    )
      return {
        ok: false,
        status: 401,
        body: { ok: false, code: 'bad_signature' },
      };
    const rows = parseHubRows(rawBody);
    if (!rows)
      return {
        ok: false,
        status: 400,
        body: { ok: false, code: 'invalid_rows' },
      };
    return { ok: true, auth: { rows } };
  },
};

/** Structured error line for a skipped row (compare-script + Vercel-log signal). */
export function logMirrorRowError(error: unknown, row: HubRow): void {
  logger.error('mesh board mirror row failed', {
    evt: 'board_mirror_error',
    code: error instanceof Error ? error.message : 'unknown',
    stageId: row.stageId,
    hubTaskId: row.taskId,
    stage: row.stage,
  });
}
