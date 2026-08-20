import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { InvestorLinksManager } from '@/app/app/(shell)/admin/investors/links/InvestorLinksManager';

const links = [
  {
    id: 'seed-link',
    token: 'seed-round-token',
    label: 'Seed Round',
    investorName: 'Acme Ventures',
    email: 'partner@acme.test',
    stage: 'engaged',
    engagementScore: 61,
    notes: null,
    isActive: true,
    expiresAt: null,
    lastEmailSentAt: null,
    emailSequenceStep: 0,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-02T00:00:00.000Z'),
    viewCount: 4,
    lastViewed: '2026-08-17T12:00:00.000Z',
  },
];

const meta: Meta<typeof InvestorLinksManager> = {
  title: 'Admin/Content Detail/InvestorLinksManager',
  component: InvestorLinksManager,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = { args: { initialLinks: links } };
