import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { InvestorPipelineTable } from '@/app/app/(shell)/admin/investors/_components/InvestorPipelineTable';

const meta: Meta<typeof InvestorPipelineTable> = {
  title: 'Admin/Content Detail/InvestorPipelineTable',
  component: InvestorPipelineTable,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

const links = [
  {
    id: 'seed-link',
    token: 'seed-round-token',
    label: 'Seed Round',
    investorName: 'Acme Ventures',
    email: 'partner@acme.test',
    stage: 'engaged',
    engagementScore: 61,
    isActive: true,
    notes: null,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-02T00:00:00Z'),
    viewCount: 4,
    lastViewed: '2026-08-17T12:00:00Z',
  },
  {
    id: 'pre-seed-link',
    token: 'pre-seed-token',
    label: 'Pre-seed follow-up',
    investorName: null,
    email: null,
    stage: 'passed',
    engagementScore: 14,
    isActive: false,
    notes: null,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    updatedAt: new Date('2026-07-02T00:00:00Z'),
    viewCount: 0,
    lastViewed: null,
  },
];

export const Populated: Story = { args: { links } };

export const Empty: Story = { args: { links: [] } };

export const Mobile: Story = {
  args: { links },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
