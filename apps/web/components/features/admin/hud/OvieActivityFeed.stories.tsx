import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { OvieActivityRow } from '@/lib/hud/company-activity';
import { OvieActivityFeedView } from './OvieActivityFeed';

const rows: readonly OvieActivityRow[] = [
  {
    id: 'task-1',
    state: 'in_progress',
    stateLabel: 'In Progress',
    title: 'Company activity feed',
    actor: 'Symphony runtime',
    linearId: 'JOV-5322',
    linearUrl: null,
    href: null,
    receipt: null,
    freshness: 'fresh',
    updatedAtIso: null,
    detail: null,
  },
  {
    id: 'pr-1',
    state: 'merged',
    stateLabel: 'Merged',
    title: 'feat: feed',
    actor: 'GitHub',
    linearId: null,
    linearUrl: null,
    href: 'https://github.com/JovieInc/Jovie/pull/18400',
    receipt: null,
    freshness: 'fresh',
    updatedAtIso: null,
    detail: 'PR #18400 landed',
  },
  {
    id: 'receipt-1',
    state: 'deployed',
    stateLabel: 'Deployed',
    title: 'JOV-5300 verified on production',
    actor: 'Summer',
    linearId: null,
    linearUrl: null,
    href: null,
    receipt: 'prod abc1234',
    freshness: 'stale',
    updatedAtIso: null,
    detail: null,
  },
];

const meta = {
  title: 'Features/Admin/Hud/OvieActivityFeed',
  component: OvieActivityFeedView,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-[28rem] bg-base p-4 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: {
    rows,
    observation: 'ok',
  },
} satisfies Meta<typeof OvieActivityFeedView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: {
    rows: [],
    observation: 'empty',
  },
};

export const Unavailable: Story = {
  args: {
    rows: [],
    observation: 'unavailable',
  },
};
