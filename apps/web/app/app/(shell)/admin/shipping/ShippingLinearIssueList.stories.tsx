import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { LinearIssueRow } from '@/lib/ovie/linear-issue-task-view';
import { ShippingLinearIssueList } from './ShippingLinearIssueList';

const issue = (
  n: number,
  type: string,
  stateName: string,
  priority: number,
  title: string
): LinearIssueRow => ({
  id: `issue-${n}`,
  identifier: `JOV-${n}`,
  title,
  url: `https://linear.app/jovie/issue/JOV-${n}`,
  priority,
  state: { name: stateName, type },
  assignee: null,
  createdAt: '2026-11-18T00:00:00.000Z',
  updatedAt: '2026-11-21T00:00:00.000Z',
});

const issues: LinearIssueRow[] = [
  issue(101, 'started', 'In Progress', 1, 'Fix release email retry loop'),
  issue(102, 'started', 'In Review', 2, 'Shipping page lists Linear issues'),
  issue(103, 'unstarted', 'Todo', 3, 'Backfill artist onboarding events'),
  issue(104, 'backlog', 'Backlog', 4, 'Tidy admin table spacing'),
  issue(105, 'triage', 'Triage', 0, 'Investigate slow profile image loads'),
];

const meta = {
  title: 'Admin/Shipping/ShippingLinearIssueList',
  component: ShippingLinearIssueList,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ShippingLinearIssueList>;

export default meta;
type Story = StoryObj<typeof meta>;

const recent = new Date(Date.now() - 4 * 60_000).toISOString();
const old = new Date(Date.now() - 3 * 60 * 60_000).toISOString();

export const Fresh: Story = {
  args: { issues, generatedAt: recent, reachable: true },
};

export const StaleLinearNotReachable: Story = {
  args: { issues, generatedAt: old, reachable: false },
};

export const LinearNotReachableNoData: Story = {
  args: { issues: [], generatedAt: null, reachable: false },
};

export const NoActiveIssues: Story = {
  args: { issues: [], generatedAt: recent, reachable: true },
};
