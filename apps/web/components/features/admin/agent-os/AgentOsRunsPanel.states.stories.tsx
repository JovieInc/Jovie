import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AgentOsRunsPanel } from './AgentOsRunsPanel';
import {
  buildArtifact,
  buildFailedArtifact,
  LONG_RUN_SUMMARY,
  LONG_RUN_TITLE,
} from './agentOsArtifact.test-fixtures';

const meta = {
  title: 'Admin/AgentOs/RunsPanel/States',
  component: AgentOsRunsPanel,
  parameters: { layout: 'fullscreen' },
  args: { artifacts: [buildArtifact()] },
} satisfies Meta<typeof AgentOsRunsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: runs are refreshing, so the header status says so. */
export const Loading: Story = {
  args: { artifacts: [], status: 'Refreshing runs...' },
};

/** Partial: runs with no gates, no cost estimate and no linked PR. */
export const Partial: Story = {
  args: {
    artifacts: [
      buildArtifact({
        verificationGates: [],
        costEstimate: null,
        linearIssueId: null,
        linearIssueUrl: null,
        pullRequestUrl: null,
      }),
      buildFailedArtifact({ id: 'run-partial-failed' }),
    ],
  },
};

/** Long content: a title and summary far past one line. */
export const LongContent: Story = {
  args: {
    artifacts: [
      buildArtifact({ title: LONG_RUN_TITLE, summary: LONG_RUN_SUMMARY }),
    ],
  },
};

/** Offline: the board shows its last known runs with an offline status. */
export const Offline: Story = {
  args: { status: 'Offline. Showing last known runs.' },
};

/** Rtl: right-to-left layout keeps the board and header aligned. */
export const RtlOverflow: Story = {
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
