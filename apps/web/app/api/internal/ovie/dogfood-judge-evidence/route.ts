import type { NextResponse } from 'next/server';
import { z } from 'zod';
import type { DogfoodJudgeLedgerValue } from '@/lib/agent-os/dogfood-judge-gate';
import {
  DogfoodJudgePersistenceError,
  verifyDogfoodJudgeSignature,
} from '@/lib/agent-os/dogfood-judge-ledger';
import { getDogfoodJudgeLedger } from '@/lib/agent-os/dogfood-judge-runtime-store';
import {
  handleCronEvidencePost,
  jsonResponse,
} from '@/lib/cron/evidence-route';
import { env } from '@/lib/env-server';
import { logger } from '@/lib/utils/logger';

/**
 * Machine write-back for the dogfood judge ledger
 * (`jovie.dogfood-judge-ledger/v1`). The publisher posts the full ledger,
 * which CAS-replaces the stored value. Any `pass` needs
 * `nothingWrong === true` and an HMAC over `digest` that verifies against
 * DOGFOOD_JUDGE_SIGNING_KEY, so an unsigned pass can never be stored.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/internal/ovie/dogfood-judge-evidence';
const MAX_BODY_BYTES = 64 * 1024;

const text = z.string().min(1).max(2_000);
const sha = z.string().regex(/^[0-9a-f]{40}$/u);
const digest = z.string().regex(/^[0-9a-f]{64}$/u);

const recordSchema = z
  .object({
    verdict: z.enum(['pass', 'fail']),
    sourceSha: sha.nullable(),
    fingerprint: text,
    judgedAt: z.string().datetime({ offset: true }),
    runId: text,
    nothingWrong: z.boolean(),
    reasons: z.array(text).max(50),
    steps: z.number().int().min(0),
    failingSteps: z.array(text).max(200),
    digest,
    signature: z
      .object({
        alg: z.literal('hmac-sha256'),
        keyId: text.optional(),
        value: z.string().regex(/^[0-9a-f]{64}$/u),
      })
      .strict()
      .nullable(),
  })
  .strict();

const bodySchema = z
  .object({
    ledger: z
      .object({
        schema: z.literal('jovie.dogfood-judge-ledger/v1'),
        currentFingerprint: text,
        requiredSurfaces: z.array(z.string().min(1).max(200)).min(1).max(100),
        surfaces: z.record(z.string().min(1).max(200), recordSchema),
        publishedAt: z.string().datetime({ offset: true }),
      })
      .strict(),
  })
  .strict();

export async function POST(request: Request): Promise<NextResponse> {
  return handleCronEvidencePost(request, {
    route: ROUTE,
    maxBytes: MAX_BODY_BYTES,
    schema: bodySchema,
    invalidLabel: 'invalid_record',
    handle: async data => {
      const key = env.DOGFOOD_JUDGE_SIGNING_KEY;
      const surfaces: Record<string, unknown> = {};
      let passes = 0;
      for (const [surfaceId, record] of Object.entries(data.ledger.surfaces)) {
        let signatureVerified = false;
        if (record.verdict === 'pass') {
          // A pass is never synthesized: explicit signoff, a concrete SHA and
          // a valid HMAC over the digest. Without the key nothing can pass.
          if (record.nothingWrong !== true || !record.sourceSha) {
            return jsonResponse(
              { error: 'pass_requires_signoff', surfaceId },
              422
            );
          }
          if (!key) {
            return jsonResponse({ error: 'signing_key_not_configured' }, 401);
          }
          signatureVerified = verifyDogfoodJudgeSignature({
            key,
            digest: record.digest,
            signature: record.signature,
          });
          if (!signatureVerified) {
            return jsonResponse({ error: 'bad_signature', surfaceId }, 422);
          }
          passes += 1;
        }
        surfaces[surfaceId] = { ...record, signatureVerified };
      }
      try {
        const result = await getDogfoodJudgeLedger().replace({
          ...data.ledger,
          surfaces,
        } as DogfoodJudgeLedgerValue);
        return jsonResponse(
          {
            ok: true,
            written: result.written,
            surfaces: Object.keys(surfaces).length,
            passes,
          },
          200
        );
      } catch (error) {
        if (error instanceof DogfoodJudgePersistenceError) {
          return jsonResponse(
            { error: 'rejected', message: error.message },
            422
          );
        }
        logger.error('[dogfood-judge-evidence] replace failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        return jsonResponse({ error: 'upsert_failed' }, 503);
      }
    },
  });
}
