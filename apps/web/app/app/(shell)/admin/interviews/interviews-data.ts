import 'server-only';

import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { userInterviews } from '@/lib/db/schema/user-interviews';

export type AdminInterviewRow = Awaited<
  ReturnType<typeof loadAdminInterviewRows>
>[number];

export async function loadAdminInterviewRows() {
  return db
    .select({
      id: userInterviews.id,
      source: userInterviews.source,
      status: userInterviews.status,
      summary: userInterviews.summary,
      transcript: userInterviews.transcript,
      createdAt: userInterviews.createdAt,
      attempts: userInterviews.summaryAttempts,
      userEmail: users.email,
      userHandle: creatorProfiles.username,
    })
    .from(userInterviews)
    .innerJoin(users, eq(users.id, userInterviews.userId))
    .leftJoin(creatorProfiles, eq(creatorProfiles.userId, users.id))
    .orderBy(desc(userInterviews.createdAt))
    .limit(200);
}
