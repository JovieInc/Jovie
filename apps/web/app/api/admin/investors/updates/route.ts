import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/admin/middleware';
import { getCachedAuth } from '@/lib/auth/cached';
import {
  InvestorUpdateWorkflowError,
  investorUpdateDecisionSchema,
  investorUpdateRecipientSegmentSchema,
  investorUpdateTrackingSettingsSchema,
} from '@/lib/investors/update-contract';
import {
  approveInvestorUpdateSnapshot,
  loadInvestorUpdateReviewState,
  recordInvestorUpdateCandidateDecision,
} from '@/lib/investors/update-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const mutationSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('candidate_decision'),
      draftId: z.string().uuid(),
      candidateId: z.string().uuid(),
      decision: investorUpdateDecisionSchema,
      editedClaim: z.string().trim().min(1).max(800).nullable(),
    })
    .strict(),
  z
    .object({
      action: z.literal('final_approval'),
      draftId: z.string().uuid(),
      expectedRenderedCopy: z.string().min(1).max(20_000),
      segments: z.array(investorUpdateRecipientSegmentSchema),
      recipientCount: z.number().int().min(1).max(100_000),
      trackingSettings: investorUpdateTrackingSettingsSchema,
    })
    .strict(),
]);

export async function GET() {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    return NextResponse.json(await loadInvestorUpdateReviewState());
  } catch (error) {
    if (error instanceof InvestorUpdateWorkflowError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

export async function POST(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  const { userId } = await getCachedAuth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const requestBody = await request.json().catch(() => null);
  const parsed = mutationSchema.safeParse(requestBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 }
    );
  }

  try {
    if (parsed.data.action === 'candidate_decision') {
      await recordInvestorUpdateCandidateDecision({
        ...parsed.data,
        userId,
      });
    } else if (parsed.data.action === 'final_approval') {
      await approveInvestorUpdateSnapshot({
        ...parsed.data,
        userId,
      });
    }
    return NextResponse.json(await loadInvestorUpdateReviewState());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? 'Invalid request.' },
        { status: 400 }
      );
    }
    if (error instanceof InvestorUpdateWorkflowError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
