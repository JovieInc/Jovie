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
      {
        name: 'github.ci',
        required: true,
        status: 'passed',
        evidenceUrl: 'https://github.com/jovie/web/pull/1/checks',
        summary: 'CI passed on the head SHA.',
        checkedAt: '2026-09-28T12:00:00Z',
      },
      {
        name: 'github.coderabbit',
        required: true,
        status: 'running',
        evidenceUrl: null,
        summary: 'Review in progress.',
        checkedAt: '2026-09-28T12:00:00Z',
      },
      {
        name: 'gstack.review',
        required: false,
        status: 'missing',
        evidenceUrl: null,
        summary: null,
        checkedAt: null,
      },
      {
        name: 'sentry.canary',
        required: false,
        status: 'skipped',
        evidenceUrl: null,
        summary: 'Skipped for docs-only change.',
        checkedAt: '2026-09-28T12:00:00Z',
      },
    ],
  },
};

export const Empty: Story = {
  args: {
    gates: [],
  },
};
