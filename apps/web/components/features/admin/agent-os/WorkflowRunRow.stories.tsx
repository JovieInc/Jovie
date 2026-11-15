import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  buildArtifact,
  buildFailedArtifact,
  buildPendingApprovalArtifact,
  LONG_RUN_SUMMARY,
  LONG_RUN_TITLE,
} from './agentOsArtifact.test-fixtures';
import { WorkflowRunRow } from './WorkflowRunRow';

/** One agent run row in the agent-os runs and approval lists. */
const meta = {
  title: 'Features/Admin/WorkflowRunRow',
  component: WorkflowRunRow,
  parameters: {
    layout: 'centered',
  },
  args: {
    artifact: buildArtifact(),
    isSelected: false,
    onSelect: () => {},
  },
} satisfies Meta<typeof WorkflowRunRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Selected: Story = {
  args: { isSelected: true, artifact: buildPendingApprovalArtifact() },
};

/** Read-only: without onSelect the row is not a button. */
export const ReadOnly: Story = {
  args: { onSelect: undefined },
};

/** Error: a failed run shows the error status pill. */
export const ErrorFailedRun: Story = {
  args: { artifact: buildFailedArtifact() },
};

/** Partial: a run with no PR or Linear link drops the action strip. */
export const PartialNoLinks: Story = {
  args: {
    artifact: buildArtifact({
      linearIssueId: null,
      linearIssueUrl: null,
      pullRequestUrl: null,
      costEstimate: null,
    }),
  },
};

/** Long content: the title truncates and the summary clamps to two lines. */
export const LongContentRun: Story = {
  args: {
    artifact: buildPendingApprovalArtifact({
      title: LONG_RUN_TITLE,
      summary: LONG_RUN_SUMMARY,
    }),
  },
};

/** Right-to-left: the row inside an RTL document. */
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
