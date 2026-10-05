import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  type InvestorPipelineRow,
  InvestorPipelineTable,
} from './InvestorPipelineTable';

const rows: InvestorPipelineRow[] = [
  {
    id: 'sequoia',
    token: 'tok_sequoia_private_investor_memo',
    label: 'Seed memo',
    investorName: 'Sequoia Capital',
    stage: 'engaged',
    engagementScore: 61,
    viewCount: 4,
    lastViewedLabel: 'Oct 5, 2026',
    isActive: true,
  },
  {
    id: 'founders-fund',
    token: 'tok_founders_fund_private_investor_memo',
    label: 'Partner follow-up',
    investorName: 'Founders Fund',
    stage: 'meeting_booked',
    engagementScore: 48,
    viewCount: 2,
    lastViewedLabel: 'Oct 4, 2026',
    isActive: true,
  },
  {
    id: 'offline-ventures',
    token: 'tok_offline_ventures_private_investor_memo',
    label: 'Initial outreach',
    investorName: 'Offline Ventures',
    stage: 'shared',
    engagementScore: 18,
    viewCount: 1,
    lastViewedLabel: 'Oct 2, 2026',
    isActive: false,
  },
];

const meta = {
  title: 'Features/Admin/Investors/InvestorPipelineTable',
  component: InvestorPipelineTable,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='min-h-screen min-w-0 bg-canvas p-3'>
        <ContentSurfaceCard className='overflow-hidden p-0'>
          <Story />
        </ContentSurfaceCard>
      </div>
    ),
  ],
} satisfies Meta<typeof InvestorPipelineTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OneRow: Story = {
  args: { rows: rows.slice(0, 1) },
};

export const MultipleRows: Story = {
  args: { rows },
};

export const Loading: Story = {
  args: { rows: [], isLoading: true },
};

export const Empty: Story = {
  args: { rows: [] },
};
