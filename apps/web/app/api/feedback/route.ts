import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { createFeedbackItem } from '@/lib/feedback';
import { notifySlackFeedbackSubmission } from '@/lib/notifications/providers/slack';
import { logger } from '@/lib/utils/logger';

const payloadSchema = z.object({
  message: z.string().trim().min(5).max(2000),
  source: z.string().trim().min(1).max(80).default('dashboard'),
  pathname: z.string().trim().max(512).nullable().optional(),
});

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    const body = await request.json();
    const parsed = payloadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const message = parsed.data.message;
    const source = parsed.data.source;
    const pathname = parsed.data.pathname ?? null;

    const userRecord = userId
      ? await db.query.users.findFirst({
          where: eq(users.clerkId, userId),
          columns: { id: true, name: true, email: true },
        })
      : null;

    const feedback = await createFeedbackItem({
      userId: userRecord?.id ?? null,
      message,
      source,
      context: {
        pathname,
        userAgent: request.headers.get('user-agent'),
        timestampIso: new Date().toISOString(),
      },
    });

    notifySlackFeedbackSubmission({
      message,
      name: userRecord?.name ?? 'Jovie user',
      email: userRecord?.email,
      source,
      pathname,
    }).catch(err => {
      logger.warn('[api/feedback] Slack notification failed', err);
    });

    return NextResponse.json({ ok: true, id: feedback.id });
  } catch {
    return NextResponse.json(
      { error: 'Unable to submit feedback' },
      { status: 500 }
    );
  }
}
