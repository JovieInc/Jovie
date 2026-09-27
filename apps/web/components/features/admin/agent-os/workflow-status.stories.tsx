import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type {
  AgentRunStatus,
  VerificationGateStatus,
} from '@/lib/agent-os/artifact';
import {
  VerificationStatusGlyph,
  WorkflowStatusGlyph,
} from './workflow-status';

const meta: Meta<typeof WorkflowStatusGlyph> = {
  title: 'Admin/AgentOs/WorkflowStatusGlyph',
  component: WorkflowStatusGlyph,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

const RUN_STATUSES: readonly AgentRunStatus[] = [
  'queued',
  'running',
  'blocked',
  'review',
  'done',
  'failed',
  'stale',
];

const GATE_STATUSES: readonly VerificationGateStatus[] = [
  'missing',
  'queued',
  'running',
  'passed',
  'failed',
  'skipped',
  'blocked',
];

export const RunStatuses: Story = {
  render: () => (
    <div className='flex flex-wrap items-center gap-4'>
      {RUN_STATUSES.map(status => (
        <WorkflowStatusGlyph key={status} status={status} />
      ))}
    </div>
  ),
};

export const GateStatuses: Story = {
  render: () => (
    <div className='flex flex-wrap items-center gap-4'>
      {GATE_STATUSES.map(status => (
        <VerificationStatusGlyph key={status} status={status} />
      ))}
    </div>
  ),
};
