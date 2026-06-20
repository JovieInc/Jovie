import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import type { DecideDistributionDraftResult } from '@/lib/release-to-revenue/distribution-drafts';
import { logger } from '@/lib/utils/logger';

type DecideDistributionDraftFn = (input: {
  readonly runId: string;
  readonly draftId: string;
  readonly userId: string;
}) => Promise<DecideDistributionDraftResult>;

function statusForDecideCode(
  code: Extract<DecideDistributionDraftResult, { ok: false }>['code']
): number {
  if (code === 'not-found' || code === 'draft-not-found') {
    return 404;
  }

  if (code === 'already-decided') {
    return 409;
  }

  return 400;
}

export async function handleDistributionDraftDecision(input: {
  readonly runId: string;
  readonly draftId: string;
  readonly decide: DecideDistributionDraftFn;
  readonly route: string;
  readonly actionLabel: 'approve' | 'reject';
}) {
  const { userId, error } = await requireAuth();
  if (error) {
    return error;
  }

  try {
    const result = await input.decide({
      runId: input.runId,
      draftId: input.draftId,
      userId,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.code },
        { status: statusForDecideCode(result.code), headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        draft: result.draft,
        runStatus: result.runStatus,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    logger.error(`[release-to-revenue/drafts/${input.actionLabel}] failed`, err);
    await captureError(
      `release-to-revenue draft ${input.actionLabel} failed`,
      err,
      {
        route: input.route,
        runId: input.runId,
        draftId: input.draftId,
      }
    );
    return NextResponse.json(
      { error: 'internal-error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}