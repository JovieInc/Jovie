import type { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  CERTIFICATION_OPERATIONAL_EVIDENCE_TIERS,
  CERTIFICATION_TASTE_EVIDENCE_TIERS,
  type CertificationReviewPacket,
  JOVIE_CERTIFICATION_CONTRACT,
} from '@/lib/agent-os/certification';
import {
  MarketingCertificationPersistenceError,
  MarketingCertificationRegistryDriftError,
} from '@/lib/agent-os/certification-adapter';
import { ingestMarketingCertificationPacket } from '@/lib/agent-os/certification-runtime-store';
import { verifyCronRequest } from '@/lib/cron/auth';
import { jsonResponse, parseBoundedJsonBody } from '@/lib/cron/evidence-route';
import { logger } from '@/lib/utils/logger';

/**
 * Machine evidence write-back for the marketing certification ledger
 * (JOV-6928 Canary A). A CI producer posts one packet per affected registry
 * object after a causal event; the existing store owns identity, registry
 * drift, monotonic packet time and admission. Evidence only: founder
 * decisions never enter through this route.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/internal/ovie/certification-evidence';
const MAX_BODY_BYTES = 64 * 1024;

const sha = z.string().regex(/^[0-9a-f]{40}$/u);
const digest = z
  .string()
  .regex(/^[0-9a-f]{64}$/u)
  .nullable();
const text = z.string().min(1).max(2_000);
const status = z.enum(['missing', 'pending', 'passed', 'failed', 'blocked']);
const tier = z.enum([
  ...CERTIFICATION_TASTE_EVIDENCE_TIERS,
  ...CERTIFICATION_OPERATIONAL_EVIDENCE_TIERS,
]);

const receipt = z
  .object({
    id: text,
    tier,
    status,
    sourceSha: sha.nullable(),
    ref: text,
    digest,
    summary: text,
  })
  .strict();
const receipts = z.array(receipt).max(50);

const packetSchema = z
  .object({
    contract: z.literal(JOVIE_CERTIFICATION_CONTRACT),
    subject: z.object({ id: text, kind: text, title: text }).strict(),
    source: z
      .object({
        repository: z.literal('JovieInc/Jovie'),
        ref: text,
        sha,
        expectedSha: sha.nullable().optional(),
        paths: z.array(text).max(50),
        digest: digest.optional(),
      })
      .strict(),
    canonicalReferences: receipts,
    invariantEvaluation: receipts,
    testsCoverage: receipts,
    visualProof: receipts,
    requiredVariants: z
      .array(
        z
          .object({
            id: text,
            label: text,
            sourceSha: sha,
            proof: receipt.nullable(),
            requiredMediaIds: z.array(text).max(20),
          })
          .strict()
      )
      .max(20),
    itemMedia: z
      .array(
        z
          .object({
            id: text,
            itemId: text,
            variantId: text.nullable(),
            status,
            sourceSha: sha.nullable(),
            ref: text,
            digest,
            summary: text,
          })
          .strict()
      )
      .max(50),
    operational: z
      .object({
        ci: receipts.optional(),
        queueMerge: receipts.optional(),
        deploy: receipts.optional(),
        runtimeDogfood: receipts.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const bodySchema = z
  .object({
    evaluatedAt: z.string().datetime({ offset: true }),
    packet: packetSchema,
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
      { error: 'invalid_packet', issues: parsed.error.issues.slice(0, 10) },
      400
    );
  }

  try {
    const row = await ingestMarketingCertificationPacket(
      parsed.data.packet as CertificationReviewPacket,
      parsed.data.evaluatedAt
    );
    return jsonResponse({ ok: true, row }, 200);
  } catch (error) {
    if (error instanceof MarketingCertificationRegistryDriftError) {
      return jsonResponse(
        { error: 'unknown_subject', message: error.message },
        422
      );
    }
    if (error instanceof MarketingCertificationPersistenceError) {
      // Identity/source mismatch, or a packet not newer than the ledger's.
      return jsonResponse({ error: 'rejected', message: error.message }, 422);
    }
    logger.error('[certification-evidence] ingest failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonResponse({ error: 'ingest_failed' }, 503);
  }
}
