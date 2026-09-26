/**
 * Public Abuse/Security Report Intake (POST /api/report)
 *
 * Receives reports from the "Report" links on profiles, smart links, and
 * wrapped /out/ links. Each valid submission lands in the moderation queue
 * (feedback_items, source='abuse_report') for admin review and takedown.
 * Responses are intentionally generic — reporters never learn moderation
 * state or internal identifiers. Rate limit: publicClickLimiter per IP.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { createFeedbackItem } from '@/lib/feedback';
import {
  allowIfRateLimitBackendDegraded,
  createRateLimitHeaders,
  getClientIP,
  publicClickLimiter,
} from '@/lib/rate-limit';
import { detectBot } from '@/lib/utils/bot-detection';
import { reportPostSchema } from '@/lib/validation/schemas/report';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function POST(request: NextRequest) {
  try {
    detectBot(request, '/api/report');

    const rateLimit = allowIfRateLimitBackendDegraded(
      await publicClickLimiter.limit(getClientIP(request)),
      { route: '/api/report' }
    );
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        {
          status: 429,
          headers: {
            ...NO_STORE_HEADERS,
            ...createRateLimitHeaders(rateLimit),
          },
        }
      );
    }

    const parsed = reportPostSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { targetType, target, category, details, reporterEmail } =
      parsed.data;

    await createFeedbackItem({
      userId: null,
      message: details || `${category} report on ${targetType} "${target}"`,
      source: 'abuse_report',
      context: {
        pathname: '/report',
        userAgent: request.headers.get('user-agent'),
        timestampIso: new Date().toISOString(),
        report: {
          targetType,
          target,
          category,
          reporterEmail: reporterEmail ?? null,
        },
      },
    });

    return NextResponse.json(
      {
        ok: true,
        message: 'Thanks — we received your report and will review it.',
      },
      { status: 202, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    captureError('Report intake failed', error, { route: '/api/report' });
    return NextResponse.json(
      { error: 'Unable to submit report right now' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
