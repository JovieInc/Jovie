import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  VerificationStatusPill,
  WorkflowStatusPill,
} from './WorkflowStatusPill';

const meta = {
  title: 'Features/Admin/WorkflowStatusPill',
  component: WorkflowStatusPill,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof WorkflowStatusPill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllRunStatuses: Story = {
  args: { status: 'running' },
  render: () => (
    <div className='flex flex-wrap gap-2'>
      {(
        [
          'queued',
          'running',
          'blocked',
          'review',
          'done',
          'failed',
          'stale',
        ] as const
      ).map(status => (
        <WorkflowStatusPill key={status} status={status} />
      ))}
    </div>
  ),
};

export const AllVerificationGateStatuses: StoryObj<
  typeof VerificationStatusPill
> = {
  args: { status: 'passed' },
  render: () => (
    <div className='flex flex-wrap gap-2'>
      {(
        [
          'missing',
          'queued',
          'running',
          'passed',
          'failed',
          'skipped',
          'blocked',
        ] as const
      ).map(status => (
        <VerificationStatusPill key={status} status={status} />
      ))}
    </div>
  ),
};
