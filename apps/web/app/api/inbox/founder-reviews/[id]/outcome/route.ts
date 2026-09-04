import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/require-auth';
import { founderReviewErrorResponse } from '@/lib/founder-review/route-error';
import { updateFounderReviewActionOutcome } from '@/lib/founder-review/server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

export const runtime = 'nodejs';

const OutcomeSchema = z.object({
  status: z.enum(['applied', 'failed']),
  errorCode: z.string().trim().min(1).max(120).nullable().default(null),
});

interface RouteParams {
  readonly params: Promise<{ readonly id: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { userId, error } = await requireAuth();
  if (error) return error;
  const parsed = OutcomeSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid-founder-review-outcome' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
  const { id } = await params;
  try {
    const receipt = await updateFounderReviewActionOutcome({
      id,
      userIdentity: userId,
      status: parsed.data.status,
      errorCode: parsed.data.status === 'failed' ? parsed.data.errorCode : null,
    });
    return NextResponse.json(
      { ok: true, receipt },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error_) {
    return founderReviewErrorResponse(
      error_,
      '/api/inbox/founder-reviews/[id]/outcome'
    );
  }
}
