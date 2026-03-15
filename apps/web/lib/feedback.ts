import { and, desc, sql as drizzleSql, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { feedbackItems } from '@/lib/db/schema/feedback';

export type FeedbackContext = Record<string, unknown> & {
  pathname: string | null;
  userAgent: string | null;
  timestampIso: string;
};

export interface FeedbackAdminRow {
  id: string;
  message: string;
  source: string;
  status: 'pending' | 'dismissed';
  context: Record<string, unknown>;
  dismissedAt: Date | null;
  createdAt: Date;
  user: {
    id: string | null;
    name: string | null;
    email: string | null;
    clerkId: string | null;
  };
}

export async function createFeedbackItem(params: {
  userId: string | null;
  message: string;
  source?: string;
  context: FeedbackContext;
}): Promise<{ id: string }> {
  try {
    const [item] = await db
      .insert(feedbackItems)
      .values({
        userId: params.userId,
        message: params.message,
        source: params.source ?? 'dashboard',
        context: params.context,
        status: 'pending',
      })
      .returning({ id: feedbackItems.id });

    if (!item) {
      throw new Error('Feedback persistence returned no row');
    }

    return item;
  } catch (error) {
    console.error('[feedback] createFeedbackItem failed:', error);
    throw error;
  }
}

export async function getAdminFeedbackItems(
  limit = 100
): Promise<FeedbackAdminRow[]> {
  try {
    const rows = await db
      .select({
        id: feedbackItems.id,
        message: feedbackItems.message,
        source: feedbackItems.source,
        status: feedbackItems.status,
        context: feedbackItems.context,
        dismissedAt: feedbackItems.dismissedAt,
        createdAt: feedbackItems.createdAt,
        userId: users.id,
        userName: users.name,
        userEmail: users.email,
        userClerkId: users.clerkId,
      })
      .from(feedbackItems)
      .leftJoin(users, eq(feedbackItems.userId, users.id))
      .orderBy(desc(feedbackItems.createdAt))
      .limit(limit);

    return rows.map(row => ({
      id: row.id,
      message: row.message,
      source: row.source,
      status: row.status,
      context: (row.context ?? {}) as Record<string, unknown>,
      dismissedAt: row.dismissedAt,
      createdAt: row.createdAt,
      user: {
        id: row.userId,
        name: row.userName,
        email: row.userEmail,
        clerkId: row.userClerkId,
      },
    }));
  } catch (error) {
    console.error('[feedback] getAdminFeedbackItems failed:', error);
    return [];
  }
}

export async function dismissFeedbackItem(id: string) {
  try {
    const [item] = await db
      .update(feedbackItems)
      .set({
        status: 'dismissed',
        dismissedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(feedbackItems.id, id), eq(feedbackItems.status, 'pending')))
      .returning({ id: feedbackItems.id });

    return item;
  } catch (error) {
    console.error('[feedback] dismissFeedbackItem failed:', error);
    return undefined;
  }
}

const EMPTY_FEEDBACK_COUNTS = { total: 0, pending: 0, dismissed: 0 } as const;

export async function getFeedbackCounts() {
  try {
    const rows = await db
      .select({
        status: feedbackItems.status,
        count: drizzleSql<number>`count(*)::int`,
      })
      .from(feedbackItems)
      .groupBy(feedbackItems.status);

    return {
      total: rows.reduce((acc, row) => acc + (row.count ?? 0), 0),
      pending: rows.find(r => r.status === 'pending')?.count ?? 0,
      dismissed: rows.find(r => r.status === 'dismissed')?.count ?? 0,
    };
  } catch (error) {
    console.error('[feedback] getFeedbackCounts failed:', error);
    return EMPTY_FEEDBACK_COUNTS;
  }
}
