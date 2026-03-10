import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { createFeedbackItem } from '@/lib/feedback';
import { notifySlackFeedbackSubmission } from '@/lib/notifications/providers/slack';

export async function submitChatFeedback(params: {
  clerkUserId: string;
  message: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const userRecord = await db.query.users.findFirst({
      where: eq(users.clerkId, params.clerkUserId),
      columns: { id: true, name: true, email: true },
    });

    await createFeedbackItem({
      userId: userRecord?.id ?? null,
      message: params.message,
      source: 'chat',
      context: {
        pathname: '/app',
        userAgent: null,
        timestampIso: new Date().toISOString(),
      },
    });

    await notifySlackFeedbackSubmission({
      message: params.message,
      name: userRecord?.name ?? 'Jovie user',
      email: userRecord?.email,
      source: 'chat',
      pathname: '/app',
    });

    return { success: true };
  } catch (error) {
    console.error('[chat] submitFeedback failed:', error);
    return { success: false, error: 'Unable to submit feedback right now.' };
  }
}
