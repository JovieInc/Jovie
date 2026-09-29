import type { NextResponse } from 'next/server';
import { z } from 'zod';
import { DesignCiJudgeCertificationPersistenceError } from '@/lib/agent-os/design-ci-judge-certification';
import { upsertDesignCiJudgeCells } from '@/lib/agent-os/design-ci-judge-runtime-store';
import { verifyCronRequest } from '@/lib/cron/auth';
import { jsonResponse, parseBoundedJsonBody } from '@/lib/cron/evidence-route';
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

export async function POST(request: Request): Promise<NextResponse> {
  const authError = verifyCronRequest(request, { route: ROUTE });
  if (authError) return authError;

  const parsedBody = await parseBoundedJsonBody(request, MAX_BODY_BYTES);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = bodySchema.safeParse(parsedBody.value);
  if (!parsed.success) {
    return jsonResponse(
      { error: 'invalid_batch', issues: parsed.error.issues.slice(0, 10) },
      400
    );
  }

  try {
    const result = await upsertDesignCiJudgeCells(
      parsed.data.cells,
      parsed.data.evaluatedAt
    );
    return jsonResponse({ ok: true, ...result }, 200);
  } catch (error) {
    if (error instanceof DesignCiJudgeCertificationPersistenceError) {
      return jsonResponse({ error: 'rejected', message: error.message }, 422);
    }
    logger.error('[design-ci-judge-evidence] upsert failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonResponse({ error: 'upsert_failed' }, 503);
  }
}
