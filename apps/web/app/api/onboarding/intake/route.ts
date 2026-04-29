import { currentUser } from '@clerk/nextjs/server';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import {
  type InterviewTranscriptEntry,
  userInterviews,
} from '@/lib/db/schema/user-interviews';
import { captureError } from '@/lib/error-tracking';
import { normalizeEmail } from '@/lib/utils/email';
import { waitlistRequestSchema } from '@/lib/validation/schemas';
import {
  submitWaitlistAccessRequest,
  type WaitlistAccessOutcome,
} from '@/lib/waitlist/access-request';

export const runtime = 'nodejs';

const transcriptEntrySchema = z.object({
  questionId: z.string().min(1).max(128),
  prompt: z.string().min(1).max(2000),
  answer: z.string().max(5000).nullable(),
  skipped: z.boolean(),
  timestamp: z.string().min(1),
});

const intakeRequestSchema = z.object({
  waitlist: waitlistRequestSchema,
  transcript: z.array(transcriptEntrySchema).min(1).max(50),
  metadata: z
    .object({
      requestedHandle: z.string().trim().max(64).optional().nullable(),
      currentWorkflow: z.string().trim().max(2000).optional().nullable(),
      biggestBlocker: z.string().trim().max(2000).optional().nullable(),
      launchGoal: z.string().trim().max(2000).optional().nullable(),
    })
    .default({}),
});

function deriveFullName(params: {
  readonly userFullName: string | null | undefined;
  readonly userUsername: string | null | undefined;
  readonly email: string;
}): string {
  const fromUser = (params.userFullName ?? '').trim();
  if (fromUser) return fromUser;

  const fromUsername = (params.userUsername ?? '').trim();
  if (fromUsername) return fromUsername;

  const localPart = params.email.split('@')[0]?.trim();
  return localPart || 'Jovie user';
}

async function ensureIntakeUser(params: {
  readonly clerkUserId: string;
  readonly email: string;
}) {
  const [existing] = await db
    .select({ id: users.id, userStatus: users.userStatus })
    .from(users)
    .where(eq(users.clerkId, params.clerkUserId))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(users)
    .values({
      clerkId: params.clerkUserId,
      email: params.email,
      userStatus: 'waitlist_pending',
    })
    .onConflictDoUpdate({
      target: users.clerkId,
      set: {
        email: params.email,
        updatedAt: new Date(),
      },
    })
    .returning({ id: users.id, userStatus: users.userStatus });

  if (!created) throw new Error('Failed to create intake user');
  return created;
}

async function upsertOnboardingInterview(params: {
  readonly userId: string;
  readonly transcript: InterviewTranscriptEntry[];
  readonly metadata: Record<string, unknown>;
  readonly outcome?: WaitlistAccessOutcome;
  readonly waitlistEntryId?: string;
}) {
  const metadata = {
    ...params.metadata,
    submittedFrom: 'onboarding_chat',
    accessOutcome: params.outcome ?? null,
    waitlistEntryId: params.waitlistEntryId ?? null,
  };

  const [row] = await db
    .insert(userInterviews)
    .values({
      userId: params.userId,
      source: 'onboarding_chat',
      transcript: params.transcript,
      metadata,
      status: 'pending',
    })
    .onConflictDoUpdate({
      target: [userInterviews.userId, userInterviews.source],
      set: {
        transcript: params.transcript,
        metadata,
        status: 'pending',
        updatedAt: new Date(),
      },
    })
    .returning({ id: userInterviews.id });

  if (row?.id) return row.id;

  const [existing] = await db
    .select({ id: userInterviews.id })
    .from(userInterviews)
    .where(
      and(
        eq(userInterviews.userId, params.userId),
        eq(userInterviews.source, 'onboarding_chat')
      )
    )
    .limit(1);

  if (!existing) throw new Error('Failed to save onboarding interview');
  return existing.id;
}

export async function POST(request: Request) {
  try {
    const { userId: clerkUserId } = await getCachedAuth();
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = intakeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const clerkUser = await currentUser();
    const emailRaw = clerkUser?.emailAddresses?.[0]?.emailAddress ?? null;
    if (!emailRaw) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const email = normalizeEmail(emailRaw);
    const fullName = deriveFullName({
      userFullName: clerkUser?.fullName,
      userUsername: clerkUser?.username,
      email,
    });
    const dbUser = await ensureIntakeUser({ clerkUserId, email: emailRaw });

    let interviewId: string;
    try {
      interviewId = await upsertOnboardingInterview({
        userId: dbUser.id,
        transcript: parsed.data.transcript as InterviewTranscriptEntry[],
        metadata: parsed.data.metadata,
      });
    } catch (error) {
      await captureError('onboarding intake transcript save failed', error, {
        route: '/api/onboarding/intake',
      });
      return NextResponse.json(
        { success: false, outcome: 'save_failed' },
        { status: 500 }
      );
    }

    const access = await submitWaitlistAccessRequest({
      clerkUserId,
      email,
      emailRaw,
      fullName,
      data: parsed.data.waitlist,
    });

    await upsertOnboardingInterview({
      userId: dbUser.id,
      transcript: parsed.data.transcript as InterviewTranscriptEntry[],
      metadata: parsed.data.metadata,
      outcome: access.outcome,
      waitlistEntryId: access.entryId,
    });

    return NextResponse.json({
      success: true,
      interviewId,
      outcome: access.outcome,
      status: access.status,
      entryId: access.entryId,
    });
  } catch (error) {
    await captureError('onboarding intake submission failed', error, {
      route: '/api/onboarding/intake',
    });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
