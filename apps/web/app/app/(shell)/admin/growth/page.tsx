import type { Metadata } from 'next';
import type { SearchParams } from 'nuqs/server';
import { InviteCampaignManager } from '@/components/features/admin/campaigns/InviteCampaignManager';
import { LeadPipelineKpis } from '@/components/features/admin/leads/LeadPipelineKpis';
import { LeadPipelineWorkspace } from '@/components/features/admin/leads/LeadPipelineWorkspace';
import { DmQueuePanel } from '@/components/features/admin/outreach/DmQueuePanel';
import { EmailQueuePanel } from '@/components/features/admin/outreach/EmailQueuePanel';
import { OutreachOverviewPanel } from '@/components/features/admin/outreach/OutreachOverviewPanel';
import { ReviewQueuePanel } from '@/components/features/admin/outreach/ReviewQueuePanel';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import { WorkspaceTabsSurface } from '@/components/organisms/WorkspaceTabsSurface';
import {
  type AdminGrowthView,
  type AdminOutreachQueue,
  adminGrowthViews,
  adminOutreachQueues,
  buildAdminGrowthHref,
  getAdminGrowthViewLabel,
  getAdminOutreachQueueLabel,
  isAdminGrowthView,
  isAdminOutreachQueue,
} from '@/constants/admin-navigation';
import { getRecentIngestHistory } from '@/lib/admin/ingest-history';
import { adminGrowthSearchParams } from '@/lib/nuqs';
import { AdminIngestContent } from '../ingest/AdminIngestPageClient';

interface AdminGrowthPageProps {
  readonly searchParams: Promise<SearchParams>;
}

export const metadata: Metadata = {
  title: 'Admin growth',
};

export const runtime = 'nodejs';

const growthTabs = adminGrowthViews.map(view => ({
  value: view,
  label: getAdminGrowthViewLabel(view),
}));

const outreachQueueTabs = adminOutreachQueues.map(queue => ({
  value: queue,
  label: getAdminOutreachQueueLabel(queue),
}));

function resolveGrowthView(view: string): AdminGrowthView {
  return isAdminGrowthView(view) ? view : 'leads';
}

function resolveOutreachQueue(queue: string): AdminOutreachQueue {
  return isAdminOutreachQueue(queue) ? queue : 'all';
}

async function renderGrowthView(
  view: AdminGrowthView,
  queue: AdminOutreachQueue,
  params: Awaited<ReturnType<typeof adminGrowthSearchParams.parse>>
) {
  switch (view) {
    case 'leads':
      return (
        <div className='space-y-4'>
          <LeadPipelineKpis />
          <LeadPipelineWorkspace
            initialSearch={params.q ?? ''}
            basePath={buildAdminGrowthHref('leads')}
          />
        </div>
      );
    case 'outreach':
      if (queue === 'email') {
        return <EmailQueuePanel />;
      }
      if (queue === 'dm') {
        return <DmQueuePanel />;
      }
      if (queue === 'review') {
        return <ReviewQueuePanel />;
      }
      return <OutreachOverviewPanel />;
    case 'campaigns':
      return (
        <div className='space-y-4'>
          <ContentSurfaceCard className='overflow-hidden'>
            <ContentSectionHeader
              title='Invite campaigns'
              subtitle='Send claim invites to unclaimed creator profiles with throttled delivery and preview-first review.'
              className='min-h-0 px-(--linear-app-header-padding-x) py-3'
            />
          </ContentSurfaceCard>
          <InviteCampaignManager />
        </div>
      );
    case 'ingest':
    default: {
      const history = await getRecentIngestHistory(50);
      return <AdminIngestContent history={history} />;
    }
  }
}

export default async function AdminGrowthPage({
  searchParams,
}: Readonly<AdminGrowthPageProps>) {
  const params = await adminGrowthSearchParams.parse(searchParams);
  const view = resolveGrowthView(params.view);
  const queue = resolveOutreachQueue(params.queue);
  const content = await renderGrowthView(view, queue, params);

  return (
    <PageShell>
      <PageContent noPadding>
        <div className='px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)'>
          <WorkspaceTabsSurface
            title='Growth operations'
            description='A single workspace for lead discovery, outreach queues, campaigns, and creator ingest.'
            primaryParam='view'
            primaryValue={view}
            primaryOptions={growthTabs}
            secondaryParam={view === 'outreach' ? 'queue' : undefined}
            secondaryValue={view === 'outreach' ? queue : undefined}
            secondaryOptions={
              view === 'outreach' ? outreachQueueTabs : undefined
            }
            clearOnPrimaryChange={['queue']}
          >
            {content}
          </WorkspaceTabsSurface>
        </div>
      </PageContent>
    </PageShell>
  );
}
