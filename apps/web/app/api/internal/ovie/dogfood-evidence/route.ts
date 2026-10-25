import type { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  handleCronEvidencePost,
  jsonResponse,
} from '@/lib/cron/evidence-route';
import {
  PROD_DOGFOOD_MISSION_STATUSES,
  type ProdDogfoodIngest,
  ProdDogfoodPersistenceError,
  recordProdDogfoodRun,
} from '@/lib/ovie/certifications/prod-dogfood-ledger';
import { postgresRecordBackend } from '@/lib/ovie/mcp/postgres-backend';
import { logger } from '@/lib/utils/logger';

/**
 * Machine write-back for the production dogfood agent
 * (.github/workflows/prod-dogfood.yml -> scripts/prod-dogfood.mjs --ingest).
 * One roll-up and its receipts per run. Receipts are validated by the same
 * jovie.dogfood-receipt/v1 validator the certification kernel uses; no
 * founder decision ever enters through this route.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/internal/ovie/dogfood-evidence';
const MAX_BODY_BYTES = 256 * 1024;

const text = z.string().min(1).max(2_000);
const nullableText = z.string().max(2_000).nullable();
const sha = z.string().regex(/^[0-9a-f]{40}$/u);

const missionSchema = z
  .object({
    missionId: text,
    subjectId: text,
    product: text,
    title: text,
    status: z.enum(PROD_DOGFOOD_MISSION_STATUSES),
    commitSha: sha.nullable(),
    deploymentId: nullableText,
    completedAt: nullableText,
    blocker: nullableText,
    owner: nullableText,
    lastCertifiedSha: sha.nullable(),
  })
  .strict();

const bodySchema = z
  .object({
    generatedAt: z.string().datetime({ offset: true }),
    servedSha: sha,
    runUrl: z.string().url().max(500).nullable().optional(),
    missions: z.array(missionSchema).min(1).max(50),
    // Receipts are validated field-by-field by validateDogfoodReceipt in the store.
    receipts: z.array(z.record(z.string(), z.unknown())).max(50),
  })
  .strict();

export async function POST(request: Request): Promise<NextResponse> {
  return handleCronEvidencePost(request, {
    route: ROUTE,
    maxBytes: MAX_BODY_BYTES,
    schema: bodySchema,
    invalidLabel: 'invalid_run',
    handle: async data => {
      try {
        const result = await recordProdDogfoodRun({
          backend: postgresRecordBackend(),
          ingest: data as unknown as ProdDogfoodIngest,
        });
        return jsonResponse({ ok: true, ...result }, 200);
      } catch (error) {
        if (error instanceof ProdDogfoodPersistenceError) {
          return jsonResponse(
            { error: 'rejected', message: error.message },
            422
          );
        }
        logger.error('[dogfood-evidence] record failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        return jsonResponse({ error: 'record_failed' }, 503);
      }
    },
  });
}
