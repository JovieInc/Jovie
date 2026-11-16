import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ArtifactDrawer } from './ArtifactDrawer';
import {
  buildArtifact,
  buildFailedArtifact,
  buildGate,
  LONG_RUN_SUMMARY,
  LONG_RUN_TITLE,
} from './agentOsArtifact.test-fixtures';

/** State coverage for the selected-run drawer. */
const meta = {
  title: 'Features/Admin/ArtifactDrawer States',
  component: ArtifactDrawer,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof ArtifactDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no run selected yet. */
export const EmptyNoSelection: Story = {
  args: { artifact: null },
};

/** Empty: a selected run with no recorded gates and no cost estimate. */
export const EmptyNoGates: Story = {
  args: {
    artifact: buildArtifact({
      verificationGates: [],
      costEstimate: null,
      linearIssueId: null,
      linearIssueUrl: null,
      pullRequestUrl: null,
    }),
  },
};

/** Error: a failed run shows its blocked reason and the failed gate. */
export const ErrorFailedRun: Story = {
  args: { artifact: buildFailedArtifact() },
};

/** Long content: long title, summary, blocked reason and many gates. */
export const LongContentRun: Story = {
  args: {
    artifact: buildArtifact({
      status: 'blocked',
      title: LONG_RUN_TITLE,
      summary: LONG_RUN_SUMMARY,
      blockedReason: LONG_RUN_SUMMARY,
      verificationGates: [
        buildGate({ name: 'github.ci', summary: LONG_RUN_SUMMARY }),
        buildGate({ name: 'github.coderabbit', status: 'running' }),
        buildGate({ name: 'github.greptile', status: 'queued' }),
        buildGate({
          name: 'sentry.canary',
          required: false,
          status: 'skipped',
        }),
      ],
    }),
  },
};

/** Right-to-left: the drawer inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    artifact: buildArtifact({
      title: 'مراجعة تغييرات لوحة الإدارة',
      summary: 'دفعة تغطية القصص لمكونات الإدارة.',
    }),
  },
  decorators: [
    function RtlDocumentDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
