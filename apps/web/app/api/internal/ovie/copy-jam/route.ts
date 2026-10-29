import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  listAlternatives,
  saveAlternatives,
} from '@/lib/copy-jam/alternatives.server';
import { COPY_ROWS } from '@/lib/copy-jam/inventory';
import { buildRewriteQueue, buildTasteExamples } from '@/lib/copy-jam/queue';
import { computeStats, rewriteRatedGreatRate } from '@/lib/copy-jam/verdicts';
import { listCopyVerdicts } from '@/lib/copy-jam/verdicts.server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { parseJsonBody } from '@/lib/http/parse-json';
import { verifySummerOidcRequest } from '@/lib/ovie/summer-oidc.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/internal/ovie/copy-jam';
const ROWS = new Map(COPY_ROWS.map(r => [r.id, r]));

const json = (body: Readonly<Record<string, unknown>>, status = 200) =>
  NextResponse.json(body, { status, headers: NO_STORE_HEADERS });

const alternativesBody = z
  .object({
    copyId: z.string().regex(/^[A-Z]+-\d+$/),
    alternatives: z.array(z.string().trim().min(1).max(300)).min(2).max(3),
  })
  .strict();

/**
 * Summer reads Tim's copy verdicts.
 *   ?view=queue     lines to rewrite (sucks / meh, no pending alternatives)
 *   ?view=examples  great lines (positive) and rejected lines with notes
 *   ?view=stats     reviewed, % great, rewrite re-rated great
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!(await verifySummerOidcRequest(request)))
    return json({ error: 'unauthorized' }, 401);
  const view = new URL(request.url).searchParams.get('view') ?? 'queue';
  const verdicts = [...(await listCopyVerdicts()).values()];

  if (view === 'examples')
    return json({ ...buildTasteExamples(ROWS, verdicts) });
  if (view === 'stats') {
    return json({
      ...computeStats(COPY_ROWS.length, verdicts),
      rewrite: rewriteRatedGreatRate(verdicts),
    });
  }
  if (view === 'queue') {
    return json({
      tasks: buildRewriteQueue(ROWS, verdicts, await listAlternatives()),
    });
  }
  return json({ error: 'unknown_view' }, 400);
}

/** Summer files 2-3 alternatives for one line as a pending suggestion. */
export async function POST(request: Request): Promise<NextResponse> {
  if (!(await verifySummerOidcRequest(request)))
    return json({ error: 'unauthorized' }, 401);
  const body = await parseJsonBody<unknown>(request, {
    route: ROUTE,
    headers: NO_STORE_HEADERS,
  });
  if (!body.ok) return body.response as NextResponse;
  const parsed = alternativesBody.safeParse(body.data);
  if (!parsed.success) return json({ error: 'invalid_alternatives' }, 400);

  const result = await saveAlternatives({ ...parsed.data, by: 'summer' });
  if (result.ok) return json({ record: result.record }, 201);
  if (result.error === 'unknown_copy_id')
    return json({ error: result.error }, 404);
  return json({ error: result.error, findings: result.findings }, 422);
}
