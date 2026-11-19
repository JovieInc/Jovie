/**
 * Receiver for the mesh hub's Vercel Board shadow mirror (one-week pilot;
 * workers/mesh-hub/BOARD-PILOT.md). The Cloudflare hub POSTs HMAC-signed
 * batches of task-board stage rows here; this route writes them into the
 * team's Board channel `mesh/tasks` with `@vercel/board`, authenticating with
 * this deployment's own OIDC token — no Vercel credential is ever stored on
 * the hub.
 *
 * Hard gates: production only, secret set only, HMAC-SHA256 over
 * `${timestamp}.${rawBody}` with a ±300 s timestamp window, timing-safe
 * compare. Rows are applied in stage-id order; a row that fails is logged and
 * skipped (the mirror cursor still advances past it) so one bad row can never
 * wedge the pipeline.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { board } from '@vercel/board';
import { env } from '@/lib/env-server';
import { logger } from '@/lib/utils/logger';
import { HUB_PROFILE, type HubRow, MirrorWriter } from './mapping';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 512 * 1024;
const SKEW_MS = 300_000;
/** The hub sends at most 50 rows per POST; anything beyond that is misuse. */
const MAX_ROWS = 50;

const noStore = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
} as const;

const fail = (status: number, code: string) =>
  new Response(JSON.stringify({ ok: false, code }), {
    status,
    headers: noStore,
  });

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

function parseRows(rawBody: string): HubRow[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const rows = (parsed as { rows?: unknown })?.rows;
  if (!Array.isArray(rows) || rows.length > MAX_ROWS) return null;
  const clean: HubRow[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') return null;
    const candidate = row as Record<string, unknown>;
    if (
      !Number.isFinite(Number(candidate.stageId)) ||
      typeof candidate.taskId !== 'string' ||
      typeof candidate.stage !== 'string'
    )
      return null;
    clean.push(row as HubRow);
  }
  // Stage-id order, always: the receiver owns ordering regardless of the wire.
  return clean.sort((a, b) => a.stageId - b.stageId);
}

export async function POST(request: Request): Promise<Response> {
  if (!mirrorEnabled()) return fail(404, 'not_found');
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) return fail(413, 'body_too_large');
  const timestamp = request.headers.get('x-mesh-timestamp') ?? '';
  const provided = request.headers.get('x-mesh-signature') ?? '';
  const ts = Number(timestamp);
  if (!timestamp || !Number.isFinite(ts) || Math.abs(Date.now() - ts) > SKEW_MS)
    return fail(401, 'timestamp_skew');
  if (
    !provided ||
    !signatureMatches(
      env.BOARD_MIRROR_SECRET as string,
      timestamp,
      rawBody,
      provided
    )
  )
    return fail(401, 'bad_signature');
  const rows = parseRows(rawBody);
  if (!rows) return fail(400, 'invalid_rows');
  const writer = new MirrorWriter(board().as(HUB_PROFILE));
  let processedThrough = 0;
  for (const row of rows) {
    try {
      await writer.apply(row, process.env.BOARD_MIRROR_BODY === '1');
      processedThrough = row.stageId;
    } catch (error) {
      // Skip-and-log: a transient Board error loses one shadow update; a
      // wedged cursor would lose everything after it.
      processedThrough = row.stageId;
      logger.error('mesh board mirror row failed', {
        evt: 'board_mirror_error',
        code: error instanceof Error ? error.message : 'unknown',
        stageId: row.stageId,
        hubTaskId: row.taskId,
        stage: row.stage,
      });
    }
  }
  return new Response(JSON.stringify({ ok: true, processedThrough }), {
    status: 200,
    headers: noStore,
  });
}
