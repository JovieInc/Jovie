import { NextResponse } from 'next/server';
import { z } from 'zod';
import { captureError } from '@/lib/error-tracking';
import { createFeedbackItem } from '@/lib/feedback';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  allowIfRateLimitBackendDegraded,
  createRateLimitHeaders,
  getClientIP,
  publicClickLimiter,
} from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AGENT_FEEDBACK_SOURCE = 'agent_cli';

const short = (max: number) => z.string().trim().min(1).max(max);

/**
 * Only safe, declared execution context is accepted. `.strict()` rejects
 * anything else, so env vars, tokens, or file contents can't ride along.
 */
const bodySchema = z.object({
  kind: z.enum(['bug', 'feedback']),
  title: short(200),
  details: short(4000),
  context: z
    .object({
      cliVersion: short(40),
      command: short(120),
      exitCode: z.number().int().min(0).max(255),
      apiCode: short(60),
      status: z.number().int().min(100).max(599),
      platform: short(40),
      runtime: short(40),
      scenario: short(120),
      runId: short(80),
      channel: z.enum(['cli', 'mcp']),
    })
    .partial()
    .strict()
    .default({}),
});

function fail(status: number, code: string, message: string, headers = {}) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { ...NO_STORE_HEADERS, ...headers } }
  );
}

/**
 * Agent bug/feedback intake: `POST /api/agents/feedback`. Lands in
 * feedback_items (source='agent_cli'); Summer clusters it downstream, so one
 * report never becomes one issue. Returns a durable `reportId`.
 */
export async function POST(request: Request) {
  // ponytail: shares the public click bucket like /api/report; give it its
  // own limiter if agent reports need a different budget.
  const rateLimit = allowIfRateLimitBackendDegraded(
    await publicClickLimiter.limit(getClientIP(request)),
    { route: '/api/agents/feedback' }
  );
  if (!rateLimit.success) {
    return fail(
      429,
      'RATE_LIMITED',
      'Too many reports from this address.',
      createRateLimitHeaders(rateLimit)
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(
      400,
      'VALIDATION_FAILED',
      parsed.error.issues[0]?.message ?? 'Invalid report.'
    );
  }

  const { kind, title, details, context } = parsed.data;
  try {
    const { id } = await createFeedbackItem({
      userId: null,
      message: `[${kind}] ${title}\n\n${details}`,
      source: AGENT_FEEDBACK_SOURCE,
      context: {
        pathname: '/api/agents/feedback',
        timestampIso: new Date().toISOString(),
        userAgent: request.headers.get('user-agent')?.slice(0, 120) ?? null,
        agentReport: { kind, title, ...context },
      },
    });
    return NextResponse.json(
      { reportId: id },
      { status: 201, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    captureError('Agent feedback intake failed', error);
    return fail(500, 'INTERNAL', 'Report could not be saved.');
  }
}
