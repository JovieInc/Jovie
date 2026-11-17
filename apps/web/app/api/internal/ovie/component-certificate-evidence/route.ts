import { z } from 'zod';
import { recordComponentCertificateDelivery } from '@/lib/agent-os/component-certificate-ingest';
import {
  deliveryOrderSchema,
  SOURCE_ORDER_SCHEMA,
} from '@/lib/agent-os/source-ordered-evidence';
import { type AccessPolicy, defineRoute } from '@/lib/api/route-pipeline';
import { verifyCronRequest } from '@/lib/cron/auth';
import { jsonResponse } from '@/lib/cron/evidence-route';
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
    deliveryOrder: deliveryOrderSchema.optional(),
    evaluatedAt: z.string().datetime({ offset: true }).nullable(),
    reportBytes: z.number().int().nonnegative().nullable(),
    totals: z
      .object({
        components: z.number().int().nonnegative().nullable(),
        certified: z.number().int().nonnegative().nullable(),
        byCriterion: z
          .record(z.string().max(100), criterion)
          .refine(
            criteria => Object.keys(criteria).length <= 50,
            'byCriterion must not exceed 50 criteria'
          ),
      })
      .strict(),
    failingComponentsTotal: z.number().int().nonnegative(),
    failingComponents: z.array(failingComponent).max(25),
    runUrl: z.string().url().max(500).nullable(),
    artifactName: z.string().min(1).max(200).nullable(),
  })
  .strict();

const cronAccess: AccessPolicy<null> = {
  name: 'cron-secret',
  async authorize(request) {
    const denied = verifyCronRequest(request, { route: ROUTE });
    return denied
      ? { ok: false, status: denied.status, body: await denied.json() }
      : { ok: true, auth: null };
  },
};

// Same authorization as POST; negotiation never reads a body or touches storage.
export const OPTIONS = defineRoute({ route: ROUTE, access: cronAccess }, () =>
  jsonResponse({ ok: true, deliveryOrderSchema: SOURCE_ORDER_SCHEMA }, 200)
);

export const POST = defineRoute(
  {
    route: ROUTE,
    access: cronAccess,
    body: {
      schema: payloadSchema,
      maxBodySize: MAX_BODY_BYTES,
      invalidBody: error => ({
        error: 'invalid_packet',
        issues: error.issues.slice(0, 10),
      }),
    },
  },
  async ({ body: data }) => {
    try {
      const stored = await recordComponentCertificateDelivery(data);
      return jsonResponse(
        {
          historyCount: stored.historyCount,
          ok: stored.accepted,
          accepted: stored.accepted,
          reason: stored.reason,
          storedHeadSha: stored.packet.headSha,
          deliveryOrder: stored.packet.deliveryOrder ?? null,
        },
        stored.accepted ? 200 : 409
      );
    } catch (error) {
      logger.error('[component-certificate-evidence] ingest failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return jsonResponse({ error: 'ingest_failed' }, 503);
    }
  }
);
