import type { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  handleCronEvidencePost,
  jsonResponse,
} from '@/lib/cron/evidence-route';
import {
  COMPONENT_CERTIFICATE_REPORT_SCHEMA,
  ComponentCertificatePersistenceError,
  type ComponentCertificateReport,
  CRITERION_STATUSES,
  recordComponentCertificateReport,
} from '@/lib/ovie/certifications/component-certificate-ledger';
import { postgresRecordBackend } from '@/lib/ovie/mcp/postgres-backend';
import { logger } from '@/lib/utils/logger';

/**
 * Machine write-back for the design-system component certificates
 * (`node scripts/component-certificate.mjs --all --out report.json`, plus
 * `--guards`). Validates the jovie.component-certificate-report/v1 schema,
 * binds the report to its head SHA and records it compare-and-set; a stale
 * report is replayed, not applied. No founder decision enters here.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/internal/ovie/component-certificate-evidence';
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_COMPONENTS = 2_000;

const text = z.string().min(1).max(2_000);
const status = z.enum(CRITERION_STATUSES);
const counts = z
  .object({
    pass: z.number().int().min(0),
    fail: z.number().int().min(0),
    unknown: z.number().int().min(0),
    na: z.number().int().min(0),
  })
  .strict();

// The CLI attaches per-criterion detail; the ledger keeps only what Ovie
// renders, so the detail is read for journeys and dropped.
const criterionSchema = z
  .object({
    id: text,
    status,
    journeys: z.array(text).max(50).optional(),
  })
  .passthrough();

const certificateSchema = z
  .object({
    component: text,
    certified: z.boolean(),
    criteria: z.array(criterionSchema).min(1).max(50),
    missing: z
      .array(z.object({ criterion: text, reason: text }).passthrough())
      .max(50),
  })
  .passthrough();

const guardsSchema = z
  .object({
    total: z.number().int().min(0),
    guardsLanded: z.number().int().min(0),
    guardCoverage: z.number().min(0).max(1).nullable(),
    weeks: z.record(
      z.string().regex(/^\d{4}-W\d{2}$/u),
      z
        .object({
          human: z.number().int().min(0),
          guard: z.number().int().min(0),
          agent: z.number().int().min(0),
        })
        .strict()
    ),
  })
  .passthrough();

const bodySchema = z
  .object({
    report: z
      .object({
        schema: z.literal(COMPONENT_CERTIFICATE_REPORT_SCHEMA),
        generatedAt: z.string().datetime({ offset: true }),
        headSha: z.string().regex(/^[0-9a-f]{40}$/u),
        totals: z
          .object({
            components: z.number().int().min(0),
            certified: z.number().int().min(0),
            byCriterion: z.record(text, counts),
          })
          .strict(),
        certificates: z.array(certificateSchema).max(MAX_COMPONENTS),
      })
      .strict(),
    guards: guardsSchema.nullable().optional(),
  })
  .strict();

export async function POST(request: Request): Promise<NextResponse> {
  return handleCronEvidencePost(request, {
    route: ROUTE,
    maxBytes: MAX_BODY_BYTES,
    schema: bodySchema,
    invalidLabel: 'invalid_report',
    handle: async data => {
      const report: ComponentCertificateReport = {
        ...data.report,
        certificates: data.report.certificates.map(cert => ({
          component: cert.component,
          certified: cert.certified,
          journeys:
            cert.criteria.find(c => c.id === 'journeys')?.journeys ?? [],
          criteria: cert.criteria.map(c => ({ id: c.id, status: c.status })),
          missing: cert.missing.map(m => ({
            criterion: m.criterion,
            reason: m.reason,
          })),
        })),
      };
      try {
        const result = await recordComponentCertificateReport({
          backend: postgresRecordBackend(),
          ingest: {
            report,
            guards: data.guards
              ? {
                  total: data.guards.total,
                  guardsLanded: data.guards.guardsLanded,
                  guardCoverage: data.guards.guardCoverage,
                  weeks: data.guards.weeks,
                }
              : null,
          },
        });
        return jsonResponse({ ok: true, ...result }, 200);
      } catch (error) {
        if (error instanceof ComponentCertificatePersistenceError) {
          return jsonResponse(
            { error: 'rejected', message: error.message },
            422
          );
        }
        logger.error('[component-certificate-evidence] record failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        return jsonResponse({ error: 'record_failed' }, 503);
      }
    },
  });
}
