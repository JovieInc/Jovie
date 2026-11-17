import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  VerificationStatusPill,
  WorkflowStatusPill,
} from './WorkflowStatusPill';

/** State coverage for the agent-os status pills. */
const meta = {
  title: 'Features/Admin/WorkflowStatusPill States',
  component: WorkflowStatusPill,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof WorkflowStatusPill>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Error: a failed run renders the error badge. */
export const ErrorFailedRun: Story = {
  args: { status: 'failed' },
};

/** Error: a failed verification gate renders the error badge. */
export const ErrorFailedGate: StoryObj<typeof VerificationStatusPill> = {
  args: { status: 'failed' },
  render: args => <VerificationStatusPill {...args} />,
};
