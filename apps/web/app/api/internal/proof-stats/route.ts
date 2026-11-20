import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveContentWriter } from '@/lib/content-records/access.server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { getSummerCard } from '@/lib/ovie/summer-cards.server';
import { proofStatObservationSchema } from '@/lib/proof-stats/content-kind';
import { resolveProofStat } from '@/lib/proof-stats/format';
import { computeProofStatsMetrics } from '@/lib/proof-stats/metrics';
import {
  getProofStatsRecord,
  recordProofObservations,
} from '@/lib/proof-stats/publish.server';
import { getProofStat, listProofStats } from '@/lib/proof-stats/registry';
import { logger } from '@/lib/utils/logger';

// Reads the request (auth headers), so it is always dynamic; no segment
// cache export (Cache Components ratchet).
export const runtime = 'nodejs';
const ROUTE = '/api/internal/proof-stats';
const MAX_BODY_BYTES = 32 * 1024;
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
/** Admin/content-writer feed and intake; production counts come only from cron. */
export async function GET(request: Request) {
  const writer = await resolveContentWriter(request);
  if (!writer.ok) return json({ error: writer.error }, writer.status);
  try {
    const now = new Date();
    const { record, versionId } = await getProofStatsRecord();
    const stats = listProofStats().map(definition => ({
      ...resolveProofStat(definition, record.observations[definition.id], {
        now,
        surface: 'internal',
      }),
      visibility: definition.visibility,
      legalClass: definition.legalClass,
      status: definition.status,
      sourceKind: definition.source.kind,
    }));
    return json({
      versionId,
      metrics: computeProofStatsMetrics(record, now),
      stats,
      events: record.events,
    });
  } catch (error) {
    logger.error('[api/internal/proof-stats] read failed', error);
    await captureError('Proof stats feed failed', error, { route: ROUTE });
    return json({ error: 'Internal error' }, 500);
  }
}
const bodySchema = z
  .object({
    reason: z.string().trim().min(3).max(300),
    observations: z
      .array(
        z
          .object({
            id: z.string(),
            observation: proofStatObservationSchema,
          })
          .strict()
      )
      .min(1)
      .max(40),
  })
  .strict();
async function admissionErrors(
  input: z.infer<typeof bodySchema>
): Promise<string[]> {
  const errors: string[] = [];
  for (const { id, observation } of input.observations) {
    const stat = getProofStat(id);
    if (!stat) {
      errors.push(`${id}: not in the registry`);
      continue;
    }
    // Production counts are measured by the server, never submitted.
    if (stat.source.kind === 'production') {
      errors.push(`${id}: production stats are measured by the hourly refresh`);
    }
    if (stat.source.kind === 'benchmark' && !observation.receipt) {
      errors.push(`${id}: benchmark observations need the run receipt URL`);
    }
    if (observation.approval) {
      // Approval is the founder's decision on a Summer card, verified here.
      const card = await getSummerCard(observation.approval.cardId);
      if (
        !card ||
        card.status !== 'approved' ||
        card.resolution !== 'founder'
      ) {
        errors.push(
          `${id}: approval card ${observation.approval.cardId} is not founder-approved`
        );
      }
    }
  }
  return errors;
}
export async function POST(request: Request) {
  const writer = await resolveContentWriter(request);
  if (!writer.ok) return json({ error: writer.error }, writer.status);
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES)
    return json({ error: 'Body too large' }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { error: 'Invalid request', details: z.treeifyError(parsed.error) },
      400
    );
  }
  try {
    const errors = await admissionErrors(parsed.data);
    if (errors.length > 0) return json({ error: 'Rejected', errors }, 422);
    const result = await recordProofObservations(parsed.data.observations, {
      actor: writer.actor,
      reason: parsed.data.reason,
    });
    return json(result);
  } catch (error) {
    logger.error('[api/internal/proof-stats] record failed', error);
    await captureError('Proof stats intake failed', error, { route: ROUTE });
    return json({ error: 'Internal error' }, 500);
  }
}
