import type { NextResponse } from 'next/server';
import { z } from 'zod';
import { recordComponentCertificateDelivery } from '@/lib/agent-os/component-certificate-ingest';
import {
  handleCronEvidencePost,
  jsonResponse,
} from '@/lib/cron/evidence-route';
import { logger } from '@/lib/utils/logger';

/**
 * Machine evidence write-back for the whole-repo component certificate
 * (JOV-12456). The workflow (component-certificate.yml) posts one bounded
 * compact packet per run; the full report stays in the run artifact. The
 * full report must never be posted here: it outgrows the ~4.5MB function
 * body limit enforced at the edge before routing (HTTP 413). Evidence only;
 * founder decisions never enter through this route.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/internal/ovie/component-certificate-evidence';
// Mirrors the sibling evidence routes' bounded bodies (64KB). This cap is a
// deliberate ceiling on the compact packet, not a raised limit.
const MAX_BODY_BYTES = 64 * 1024;

const sha = z.string().regex(/^[0-9a-f]{40}$/u);
const criterion = z
  .object({
    fail: z.number().int().nonnegative(),
    na: z.number().int().nonnegative(),
    pass: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
  })
  .strict();
const failingComponent = z
  .object({
    applicable: z.number().int().nonnegative(),
    component: z.string().min(1).max(300),
    passing: z.number().int().nonnegative(),
  })
  .strict();

const payloadSchema = z
  .object({
    schema: z.literal('jovie.component-certificate-evidence/v1'),
    headSha: sha,
    evaluatedAt: z.string().datetime({ offset: true }).nullable(),
    reportBytes: z.number().int().nonnegative().nullable(),
    totals: z
      .object({
        components: z.number().int().nonnegative().nullable(),
        certified: z.number().int().nonnegative().nullable(),
        byCriterion: z.record(z.string().max(100), criterion),
      })
      .strict(),
    failingComponentsTotal: z.number().int().nonnegative(),
    failingComponents: z.array(failingComponent).max(25),
    runUrl: z.string().url().max(500).nullable(),
    artifactName: z.string().min(1).max(200).nullable(),
  })
  .strict();

const bodySchema = payloadSchema;

export async function POST(request: Request): Promise<NextResponse> {
  return handleCronEvidencePost(request, {
    route: ROUTE,
    maxBytes: MAX_BODY_BYTES,
    schema: bodySchema,
    invalidLabel: 'invalid_packet',
    handle: async data => {
      try {
        const stored = await recordComponentCertificateDelivery(
          data as Record<string, unknown> & { headSha: string }
        );
        return jsonResponse(
          {
            historyCount: stored.historyCount,
            ok: true,
            storedHeadSha: data.headSha,
          },
          200
        );
      } catch (error) {
        logger.error('[component-certificate-evidence] ingest failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        return jsonResponse({ error: 'ingest_failed' }, 503);
      }
    },
  });
}
