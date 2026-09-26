import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { composeCompanyActivity } from '@/lib/hud/company-activity';
import { CompanyActivityFeedView } from './CompanyActivityFeed';

const meta = {
  title: 'Features/Admin/Hud/CompanyActivityFeed',
  component: CompanyActivityFeedView,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof CompanyActivityFeedView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    feed: composeCompanyActivity({
      pullRequests: {
        availability: 'available',
        totalOpen: 1,
        items: [
          {
            number: 18684,
            title: 'feat(hud): activity feed',
            url: 'https://github.com/JovieInc/Jovie/pull/18684',
            headRefName: 'devin/jov-5322-x',
            authorLogin: 'devin-ai-integration',
            updatedAtIso: '2026-09-26T09:00:00.000Z',
            status: 'merge_queue',
            statusLabel: 'MQ',
            statusDetail: 'Position 2',
            mergeQueuePosition: 2,
          },
        ],
        truncated: false,
        errorMessage: null,
      },
      receiptedShips: [
        {
          linearIssue: 'JOV-4900',
          symphonyRef: 'sym-1',
          mergeQueueRef: 'mq-1',
          prodSha: '0123456789abcdef0123456789abcdef01234567',
          receiptAt: '2026-09-26T08:00:00.000Z',
        },
      ],
    }),
  },
};

export const Empty: Story = {
  args: { feed: { rows: [], truncated: false } },
};
