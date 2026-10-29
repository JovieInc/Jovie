import type { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  handleCronEvidencePost,
  jsonResponse,
} from '@/lib/cron/evidence-route';
import { captureError } from '@/lib/error-tracking';
import {
  certifyProfile,
  certifyWaitlistEntry,
} from '@/lib/waitlist/profile-certification-runner.server';

/**
 * Certify one waitlist profile on demand (operator or agent dogfood run).
 * The same function the claim, approval and import events call; this route
 * only lets a machine run it for a backlog entry and attach the walk's video
 * and screenshots to the receipt. CRON_SECRET bearer only.
 */

export const runtime = 'nodejs';

const ROUTE = '/api/internal/waitlist/profile-certification';
const MAX_BODY_BYTES = 32 * 1024;

const evidenceSchema = z
  .object({
    videoUrl: z.string().url().max(1_000).nullable(),
    screenshots: z
      .array(
        z
          .object({
            step: z.string().min(1).max(200),
            url: z.string().url().max(1_000),
            verdict: z.enum(['pass', 'fail']),
          })
          .strict()
      )
      .max(40),
  })
  .strict();

const bodySchema = z
  .object({
    entryId: z.string().uuid().optional(),
    profileId: z.string().uuid().optional(),
    remediate: z.boolean().optional(),
    evidence: evidenceSchema.nullable().optional(),
  })
  .strict()
  .refine(body => Boolean(body.entryId) !== Boolean(body.profileId), {
    message: 'Pass exactly one of entryId or profileId.',
  });

export async function POST(request: Request): Promise<NextResponse> {
  return handleCronEvidencePost(request, {
    route: ROUTE,
    maxBytes: MAX_BODY_BYTES,
    schema: bodySchema,
    invalidLabel: 'invalid_request',
    handle: async body => {
      try {
        if (body.profileId) {
          const receipt = await certifyProfile({
            profileId: body.profileId,
            trigger: 'manual',
            remediate: body.remediate,
            evidence: body.evidence ?? null,
          });
          return receipt
            ? jsonResponse({ ok: true, receipt }, 200)
            : jsonResponse({ error: 'not_found' }, 404);
        }
        const result = await certifyWaitlistEntry({
          entryId: body.entryId as string,
          trigger: 'manual',
          remediate: body.remediate,
          evidence: body.evidence ?? null,
        });
        return result.outcome === 'certified'
          ? jsonResponse({ ok: true, receipt: result.receipt }, 200)
          : jsonResponse({ ok: true, outcome: 'no_profile' }, 200);
      } catch (error) {
        await captureError('Profile certification route failed', error, {
          route: ROUTE,
        });
        return jsonResponse({ error: 'certification_failed' }, 503);
      }
    },
  });
}
