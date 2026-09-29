import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { VerificationGateList } from './VerificationGateList';

const meta = {
  title: 'Features/Admin/VerificationGateList',
  component: VerificationGateList,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof VerificationGateList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MixedStatuses: Story = {
  args: {
    gates: [
      { name: 'github.ci', required: true, status: 'passed' },
      { name: 'github.coderabbit', required: true, status: 'running' },
      { name: 'gstack.review', required: false, status: 'missing' },
      { name: 'sentry.canary', required: false, status: 'skipped' },
    ],
  },
};

export const Empty: Story = {
  args: {
    gates: [],
  },
};
