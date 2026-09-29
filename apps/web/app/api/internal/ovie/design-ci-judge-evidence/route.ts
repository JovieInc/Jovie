import { NextResponse } from 'next/server';
import { z } from 'zod';
import { DesignCiJudgeCertificationPersistenceError } from '@/lib/agent-os/design-ci-judge-certification';
import { upsertDesignCiJudgeCells } from '@/lib/agent-os/design-ci-judge-runtime-store';
import { verifyCronRequest } from '@/lib/cron/auth';
import { logger } from '@/lib/utils/logger';

/**
 * Machine write-back for the JOV-6944 Design CI judge matrix. The CLI
 * (`pnpm design-ci:judge-matrix --persist`) posts one batch per run; the
 * store owns identity and the skip-unless-changed decision. No founder
 * decision ever enters through this route.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/internal/ovie/design-ci-judge-evidence';
const MAX_BODY_BYTES = 256 * 1024;
const MAX_CELLS_PER_REQUEST = 500;
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const text = z.string().min(1).max(2_000);
const route = z.enum([
  'deterministic',
  'jev',
  'visual',
  'human',
  'insufficient',
]);
const state = z.enum(['pass', 'fail', 'insufficient']);
const fingerprint = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

const cellSchema = z
  .object({
    cellId: text,
    rowId: text,
    unitId: text,
    route,
    state,
    evidence: z.array(text).max(50),
    artifactHash: fingerprint,
    rubricFingerprint: fingerprint,
    inputFingerprint: fingerprint,
  })
  .strict();

const bodySchema = z
  .object({
    evaluatedAt: z.string().datetime({ offset: true }),
    cells: z.array(cellSchema).min(1).max(MAX_CELLS_PER_REQUEST),
  })
  .strict();

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export async function POST(request: Request): Promise<NextResponse> {
  const authError = verifyCronRequest(request, { route: ROUTE });
  if (authError) return authError;

  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    return json({ error: 'payload_too_large' }, 413);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const parsed = bodySchema.safeParse(parsedJson);
  if (!parsed.success) {
    return json(
      { error: 'invalid_batch', issues: parsed.error.issues.slice(0, 10) },
      400
    );
  }

  try {
    const result = await upsertDesignCiJudgeCells(
      parsed.data.cells,
      parsed.data.evaluatedAt
    );
    return json({ ok: true, ...result }, 200);
  } catch (error) {
    if (error instanceof DesignCiJudgeCertificationPersistenceError) {
      return json({ error: 'rejected', message: error.message }, 422);
    }
    logger.error('[design-ci-judge-evidence] upsert failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return json({ error: 'upsert_failed' }, 503);
  }
}
