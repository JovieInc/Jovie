import { Badge } from '@jovie/ui';
import { desc, eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminToolPage } from '@/components/features/admin/layout/AdminToolPage';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { APP_ROUTES } from '@/constants/routes';
import { isAdmin as checkAdminRole } from '@/lib/admin/roles';
import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  type InterviewTranscriptEntry,
  userInterviews,
} from '@/lib/db/schema/user-interviews';
import { capitalizeFirst } from '@/lib/utils/string-utils';

export const metadata: Metadata = { title: 'Interviews — Admin' };
export const runtime = 'nodejs';

async function requireAdminOrRedirect(): Promise<void> {
  const { userId } = await getCachedAuth();
  if (!userId || !(await checkAdminRole(userId))) {
    redirect(APP_ROUTES.DASHBOARD);
  }
}

function formatDate(iso: Date | string): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function statusBadgeTone(status: string) {
  switch (status) {
    case 'summarized':
      return 'success';
    case 'pending':
    case 'summarizing':
      return 'warning';
    case 'failed':
      return 'error';
    default:
      return 'neutral';
  }
}

export default async function AdminInterviewsPage() {
  await requireAdminOrRedirect();

  const rows = await db
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

  return (
    <AdminToolPage
      title='User Interviews'
      description='Mom Test interviews captured after onboarding.'
      testId='admin-interviews-page'
    >
      <ContentSurfaceCard className='overflow-hidden p-0'>
        {rows.length === 0 ? (
          <div className='px-(--linear-app-header-padding-x) py-6 text-app text-secondary-token'>
            No interviews yet.
          </div>
        ) : (
          <div className='divide-y divide-subtle'>
            {rows.map(row => {
              const transcript =
                (row.transcript as InterviewTranscriptEntry[] | null) ?? [];
              const answered = transcript.filter(t => !t.skipped).length;
              const label =
                row.userHandle !== null && row.userHandle !== undefined
                  ? `@${row.userHandle}`
                  : (row.userEmail ?? 'unknown user');

              return (
                <details
                  key={row.id}
                  className='group px-(--linear-app-header-padding-x) py-3'
                >
                  <summary className='flex cursor-pointer list-none items-start justify-between gap-4'>
                    <div className='min-w-0 flex-1'>
                      <div className='flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-tertiary-token'>
                        <span>{formatDate(row.createdAt)}</span>
                        <span>•</span>
                        <span>{label}</span>
                        <span>•</span>
                        <span>{row.source}</span>
                        <span>•</span>
                        <span>
                          {answered}/{transcript.length} answered
                        </span>
                      </div>
                      <div className='mt-1 truncate text-sm text-primary-token'>
                        {row.summary ??
                          (row.status === 'failed'
                            ? `Summarization failed after ${row.attempts} attempts`
                            : 'Summary pending…')}
                      </div>
                    </div>
                    <Badge
                      tone={statusBadgeTone(row.status)}
                      size='sm'
                      className='shrink-0'
                    >
                      {capitalizeFirst(row.status)}
                    </Badge>
                  </summary>
                  <div className='mt-3 space-y-3 rounded-md bg-surface-0 p-3 text-app'>
                    {transcript.map((entry, idx) => (
                      <div key={`${row.id}-${entry.questionId}`}>
                        <div className='font-caption text-primary-token'>
                          Q{idx + 1}. {entry.prompt}
                        </div>
                        <div className='mt-1 whitespace-pre-wrap text-secondary-token'>
                          {entry.skipped ? (
                            <em>[skipped]</em>
                          ) : (
                            (entry.answer ?? '[empty]')
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </ContentSurfaceCard>
    </AdminToolPage>
  );
}
