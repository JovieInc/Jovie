import {
  Activity,
  ArrowRight,
  FolderKanban,
  ImageIcon,
  Users,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { AdminWorkspacePage } from '@/components/features/admin/layout/AdminWorkspacePage';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { APP_ROUTES } from '@/constants/routes';
import {
  AdminKpiSection,
  AdminKpiSectionSkeleton,
  AdminOutreachSection,
  AdminOutreachSectionSkeleton,
  AdminScoreboardSection,
  AdminScoreboardSectionSkeleton,
  AdminUsageSection,
  AdminUsageSectionSkeleton,
} from './_components';

export const metadata: Metadata = {
  title: 'Admin Scoreboard',
  description: 'Funnel scoreboard and operator tools.',
};

export const runtime = 'nodejs';

const overviewCards = [
  {
    title: 'People workspace',
    description:
      'Waitlist triage, creator management, signed-up users, releases, and feedback in one place.',
    href: APP_ROUTES.ADMIN_PEOPLE,
    icon: Users,
  },
  {
    title: 'Growth workspace',
    description:
      'Lead discovery, outreach queues, campaign review, and ingest operations.',
    href: APP_ROUTES.ADMIN_GROWTH,
    icon: FolderKanban,
  },
  {
    title: 'Operational activity',
    description: 'Recent actions, admin interventions, and platform events.',
    href: APP_ROUTES.ADMIN_ACTIVITY,
    icon: Activity,
  },
  {
    title: 'Utility tools',
    description:
      'Investor pipeline and screenshot QA tools live here when you need them.',
    href: APP_ROUTES.ADMIN_SCREENSHOTS,
    icon: ImageIcon,
  },
] as const;

type AdminView = 'scoreboard' | 'workspaces';

const adminTabs = [
  { value: 'scoreboard' as const, label: 'Scoreboard' },
  { value: 'workspaces' as const, label: 'Workspaces' },
] as const;

function isAdminView(value: string): value is AdminView {
  return value === 'scoreboard' || value === 'workspaces';
}

interface AdminPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const params = await searchParams;
  const rawView = typeof params.view === 'string' ? params.view : 'scoreboard';
  const view: AdminView = isAdminView(rawView) ? rawView : 'scoreboard';

  return (
    <AdminWorkspacePage
      title={view === 'scoreboard' ? 'Scoreboard' : 'Workspaces'}
      description='Funnel scoreboard and operator tools.'
      primaryParam='view'
      primaryValue={view}
      primaryOptions={adminTabs}
      testId='admin-overview-page'
      viewTestId='admin-overview-view'
    >
      {view === 'scoreboard' ? (
        <Suspense fallback={<AdminScoreboardSectionSkeleton />}>
          <AdminScoreboardSection />
        </Suspense>
      ) : (
        <div
          className='flex h-full flex-col gap-4'
          data-testid='admin-dashboard-content'
        >
          <div className='grid gap-4 lg:grid-cols-2 xl:grid-cols-4'>
            {overviewCards.map(card => (
              <Link
                key={card.href}
                href={card.href}
                className='group block h-full'
              >
                <ContentSurfaceCard className='flex h-full flex-col justify-between gap-4 p-4 transition-colors hover:bg-surface-0'>
                  <div className='space-y-3'>
                    <div className='flex h-10 w-10 items-center justify-center rounded-full bg-surface-0 text-secondary-token'>
                      <card.icon className='h-4 w-4' aria-hidden='true' />
                    </div>
                    <div>
                      <p className='text-[14px] font-semibold tracking-[-0.01em] text-primary-token'>
                        {card.title}
                      </p>
                      <p className='mt-1 text-[13px] leading-[19px] text-secondary-token'>
                        {card.description}
                      </p>
                    </div>
                  </div>
                  <span className='inline-flex items-center gap-2 text-[12px] font-semibold text-secondary-token transition-colors group-hover:text-primary-token'>
                    Open
                    <ArrowRight className='h-3.5 w-3.5' aria-hidden='true' />
                  </span>
                </ContentSurfaceCard>
              </Link>
            ))}
          </div>

          <Suspense fallback={<AdminKpiSectionSkeleton />}>
            <AdminKpiSection />
          </Suspense>

          <div className='grid min-h-0 flex-1 gap-4 lg:grid-cols-3'>
            <div className='lg:col-span-2'>
              <Suspense fallback={<AdminOutreachSectionSkeleton />}>
                <AdminOutreachSection />
              </Suspense>
            </div>
            <div>
              <Suspense fallback={<AdminUsageSectionSkeleton />}>
                <AdminUsageSection />
              </Suspense>
            </div>
          </div>
        </div>
      )}
    </AdminWorkspacePage>
  );
}
