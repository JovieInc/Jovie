import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { AdminLead } from '@/lib/queries';
import { LeadTable } from './LeadTable';

const LEADS_PATH = '/api/admin/leads';

const lead: AdminLead = {
  id: 'lead-1',
  linktreeHandle: 'midnightcollective',
  linktreeUrl: 'https://linktr.ee/midnightcollective',
  displayName: 'Midnight Collective',
  status: 'qualified',
  fitScore: 85,
  sourcePlatform: 'linktree',
  hasPaidTier: true,
  hasSpotifyLink: true,
  hasInstagram: true,
  hasTrackingPixels: false,
  trackingPixelPlatforms: [],
  musicToolsDetected: ['DistroKid'],
  contactEmail: 'hello@example.com',
  createdAt: '2026-01-01T00:00:00Z',
};

/** Answers the leads read for one story; nothing reaches the API. */
function stubLeads(answer: () => Promise<Response>) {
  return () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input), window.location.href);
      if (url.pathname === LEADS_PATH) return answer();
      return originalFetch(input, init);
    };
    return () => {
      globalThis.fetch = originalFetch;
    };
  };
}

const answerWith = (rows: AdminLead[]) => async () =>
  Response.json({ rows, total: rows.length });

function TableFrame({ dir = 'ltr' }: { readonly dir?: 'ltr' | 'rtl' }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );
  return (
    <QueryClientProvider client={client}>
      <div dir={dir} className='p-4'>
        <LeadTable
          funnelCounts={{ discovered: 145, qualified: 38, approved: 12 }}
        />
      </div>
    </QueryClientProvider>
  );
}

function renderTable() {
  return <TableFrame />;
}

const meta: Meta<typeof LeadTable> = {
  title: 'Admin/Tables/Leads States',
  component: LeadTable,
  parameters: {
    layout: 'fullscreen',
    // `disabled` only exists on internal row-action buttons, not as a prop.
    jovie: { uncoveredProps: ['disabled'] },
  },
  render: renderTable,
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the first page never answers, so skeleton rows hold the table. */
export const LoadingFirstPage: Story = {
  beforeEach: stubLeads(() => new Promise<Response>(() => {})),
};

/** Empty: the read succeeds with no leads. */
export const EmptyNoLeads: Story = { beforeEach: stubLeads(answerWith([])) };

/** Error: the read answers 500 and the table offers Retry. */
export const ErrorUnableToLoad: Story = {
  beforeEach: stubLeads(async () =>
    Response.json({ error: 'boom' }, { status: 500 })
  ),
};

/** Offline: the read cannot leave the browser. */
export const OfflineLeadsUnreachable: Story = {
  beforeEach: stubLeads(async () => {
    throw new TypeError('Failed to fetch');
  }),
};

/** Partial: no lead has a score, signal or tool, so those columns hide. */
export const PartialNoEnrichment: Story = {
  beforeEach: stubLeads(
    answerWith(
      ['discovered', 'approved', 'rejected'].map((status, index) => ({
        ...lead,
        id: `bare-${index}`,
        linktreeHandle: `bareartist${index + 1}`,
        linktreeUrl: `https://linktr.ee/bareartist${index + 1}`,
        displayName: null,
        status,
        fitScore: null,
        hasPaidTier: null,
        hasSpotifyLink: false,
        hasInstagram: false,
        musicToolsDetected: [],
        contactEmail: null,
      }))
    )
  ),
};

/** Long content: forty leads with long names, handles and tool lists. */
export const LongContentManyLeads: Story = {
  beforeEach: stubLeads(
    answerWith(
      Array.from({ length: 40 }, (_, index) => ({
        ...lead,
        id: `long-${index}`,
        linktreeHandle: `themidnightcollectivefeaturingthenorthernlightsorchestra${index + 1}`,
        linktreeUrl: `https://linktr.ee/long${index + 1}`,
        displayName: `The Midnight Collective Featuring The Northern Lights Orchestra And Friends ${index + 1}`,
        status: index % 2 === 0 ? 'qualified' : 'disqualified',
        hasTrackingPixels: true,
        musicToolsDetected: [
          'DistroKid',
          'TuneCore',
          'CD Baby',
          'Bandcamp',
          'Feature.fm',
          'ToneDen',
        ],
      }))
    )
  ),
};

function renderRtl() {
  return <TableFrame dir='rtl' />;
}

/** RTL: Arabic artist names in a right-to-left container. */
export const RtlArabicLeads: Story = {
  beforeEach: stubLeads(
    answerWith([
      { ...lead, displayName: 'فرقة منتصف الليل' },
      {
        ...lead,
        id: 'lead-2',
        linktreeHandle: 'northernlights',
        linktreeUrl: 'https://linktr.ee/northernlights',
        displayName: 'أوركسترا الأضواء الشمالية',
        status: 'approved',
      },
    ])
  ),
  render: renderRtl,
};
