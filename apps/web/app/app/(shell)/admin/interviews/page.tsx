import { desc, eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
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

function statusBadge(status: string): string {
  switch (status) {
    case 'summarized':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'pending':
    case 'summarizing':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'failed':
      return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    default:
      return 'bg-white/[0.05] text-secondary-token border-white/10';
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
    <div className='space-y-4 p-6'>
      <header>
        <h1 className='text-xl font-medium'>User interviews</h1>
        <p className='text-sm text-secondary-token'>
          Mom Test interviews captured after onboarding.
        </p>
      </header>
      <ContentSurfaceCard>
        {rows.length === 0 ? (
          <div className='p-6 text-sm text-secondary-token'>
            No interviews yet.
          </div>
        ) : (
          <div className='divide-y divide-white/[0.06]'>
            {rows.map(row => {
              const transcript =
                (row.transcript as InterviewTranscriptEntry[] | null) ?? [];
              const answered = transcript.filter(t => !t.skipped).length;
              const label =
                row.userHandle !== null && row.userHandle !== undefined
                  ? `@${row.userHandle}`
                  : (row.userEmail ?? 'unknown user');

              return (
                <details key={row.id} className='group p-4'>
                  <summary className='flex cursor-pointer items-start justify-between gap-4 list-none'>
                    <div className='min-w-0 flex-1'>
                      <div className='flex items-center gap-2 text-xs text-secondary-token'>
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
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${statusBadge(row.status)}`}
                    >
                      {row.status}
                    </span>
                  </summary>
                  <div className='mt-4 space-y-3 rounded-lg bg-white/[0.03] p-4 text-sm'>
                    {transcript.map((entry, idx) => (
                      <div key={`${row.id}-${entry.questionId}`}>
                        <div className='font-medium text-primary-token'>
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
    </div>
  );
}
