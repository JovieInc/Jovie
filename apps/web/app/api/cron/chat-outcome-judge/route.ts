/**
 * Daily chat outcome judge. Called by the synthetic-monitoring
 * `chat-outcome-judge` job with the cron bearer secret. Read only: it judges
 * the last day of artist chat turns for asks that ended without the action
 * (make merch, create a task, set up a release, write a bio) and reports one
 * finding per stalled intent; the job files or resolves one Linear repair
 * issue per finding key. 200 whenever the check ran.
 */
import { NextResponse } from 'next/server';
import { type AccessPolicy, defineRoute } from '@/lib/api/route-pipeline';
import { verifyCronRequest } from '@/lib/cron/auth';
import { captureError } from '@/lib/error-tracking';
import { runChatOutcomeJudge } from '@/lib/eval/turn-outcome-report';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ROUTE = '/api/cron/chat-outcome-judge';

const cronAccess: AccessPolicy<null> = {
  name: 'cron',
  async authorize(request) {
    const failure = verifyCronRequest(request, { route: ROUTE });
    if (!failure) return { ok: true, auth: null };
    return { ok: false, status: failure.status, body: await failure.json() };
  },
};

export const GET = defineRoute(
  { route: ROUTE, access: cronAccess },
  async ({ responseHeaders }) => {
    try {
      const report = await runChatOutcomeJudge();
      return NextResponse.json(report, { headers: responseHeaders });
    } catch (error) {
      await captureError('Chat outcome judge failed', error, {
        feature: 'chat-outcome-judge',
      }).catch(() => undefined);
      return NextResponse.json(
        { ok: false, code: 'judge_failed' },
        { status: 503, headers: responseHeaders }
      );
    }
  }
);
