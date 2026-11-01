import type { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  handleCronEvidencePost,
  jsonResponse,
} from '@/lib/cron/evidence-route';
import {
  PROD_GOLDEN_PATH_RECEIPT_SCHEMA,
  PROD_GOLDEN_PATH_STATUSES,
  PROD_GOLDEN_PATH_SURFACE_IDS,
  ProdGoldenPathPersistenceError,
  type ProdGoldenPathReceipt,
  recordProdGoldenPathRun,
  recordQualityContractObservations,
} from '@/lib/ovie/certifications/prod-golden-path-ledger';
import { postgresRecordBackend } from '@/lib/ovie/mcp/postgres-backend';
import { logger } from '@/lib/utils/logger';

/**
 * Machine write-back for the production golden-path certification run
 * (JOV-9625): .github/workflows/postdeploy-probes.yml -> scripts/prod-cert.mjs.
 * One receipt per surface, bound to the deployed SHA. Evidence only; founder
 * decisions never enter through this route.
 */

export const runtime = 'nodejs';

const ROUTE = '/api/internal/ovie/golden-path-evidence';
// Eight per-surface receipts, each possibly carrying a JPEG evidence frame
// (JOV-9625): 8 × ~250KB data-URL ceiling leaves headroom under ~4MB.
const MAX_BODY_BYTES = 4 * 1024 * 1024;

const text = z.string().min(1).max(2_000);
const iso = z.string().datetime({ offset: true });
const status = z.enum(PROD_GOLDEN_PATH_STATUSES);

const receiptSchema = z
  .object({
    schema: z.literal(PROD_GOLDEN_PATH_RECEIPT_SCHEMA),
    surface: z.enum(PROD_GOLDEN_PATH_SURFACE_IDS as [string, ...string[]]),
    status,
    sha: z.string().regex(/^[0-9a-f]{40}$/u),
    deploymentId: z.string().max(200).nullable(),
    startedAt: iso,
    endedAt: iso,
    runUrl: z.string().url().max(500).nullable(),
    screenIds: z.array(text).max(40),
    identity: z.enum(['anonymous', 'creator-ready', 'new-user']),
    checks: z
      .array(
        z
          .object({
            id: text,
            status: z.enum([...PROD_GOLDEN_PATH_STATUSES, 'skipped']),
            startedAt: iso,
            endedAt: iso,
            summary: z.string().max(2_000),
          })
          .strict()
      )
      .max(40),
    blocker: z.string().max(2_000).nullable(),
    issueUrl: z.string().url().max(500).nullable(),
    observations: z
      .array(
        z
          .object({
            contractId: text,
            dimension: text,
            value: z.number().finite(),
            unit: text,
            sampleSize: z.number().int().nonnegative(),
          })
          .strict()
      )
      .max(40),
    // Per-surface browser evidence (JOV-9625). Null/absent means the surface
    // was not browser-exercised — recorded as absent, never as a clean zero.
    consoleErrorCount: z.number().int().nonnegative().nullish(),
    networkErrorCount: z.number().int().nonnegative().nullish(),
    screenshot: z
      .object({
        format: z.literal('jpeg'),
        dataUrl: z.string().startsWith('data:image/jpeg;base64,').max(400_000),
      })
      .strict()
      .nullish(),
    // One admin certifications-inventory readback per run, carried on the
    // landing receipt. Evidence only: a not-viable admin fixture records
    // 'blocked' with the exact reason and never turns a surface red.
    adminInventoryReadback: z
      .object({
        status: z.enum(['passed', 'blocked', 'failed']),
        detail: z.string().max(2_000),
      })
      .strict()
      .nullish(),
  })
  .strict();

const bodySchema = z
  .object({ receipts: z.array(receiptSchema).min(1).max(20) })
  .strict();

export async function POST(request: Request): Promise<NextResponse> {
  return handleCronEvidencePost(request, {
    route: ROUTE,
    maxBytes: MAX_BODY_BYTES,
    schema: bodySchema,
    invalidLabel: 'invalid_receipts',
    handle: async data => {
      try {
        const result = await recordProdGoldenPathRun({
          backend: postgresRecordBackend(),
          receipts: data.receipts as unknown as ProdGoldenPathReceipt[],
        });
        // JOV-9625 outcome rework: fold the run's quality-contract
        // observations into the observations ledger so the six contracts'
        // observed values are populated from evidence.
        await recordQualityContractObservations({
          backend: postgresRecordBackend(),
          receipts: data.receipts as unknown as ProdGoldenPathReceipt[],
        });
        return jsonResponse({ ok: true, ...result }, 200);
      } catch (error) {
        if (error instanceof ProdGoldenPathPersistenceError) {
          return jsonResponse(
            { error: 'rejected', message: error.message },
            422
          );
        }
        logger.error('[golden-path-evidence] ingest failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        return jsonResponse({ error: 'ingest_failed' }, 503);
      }
    },
  });
}
