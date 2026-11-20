import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ApprovalQueuePanel } from './ApprovalQueuePanel';
import {
  buildPendingApprovalArtifact,
  LONG_RUN_SUMMARY,
  LONG_RUN_TITLE,
} from './agentOsArtifact.test-fixtures';

/** State coverage for the approval queue. */
const meta = {
  title: 'Features/Admin/ApprovalQueuePanel States',
  component: ApprovalQueuePanel,
  parameters: {
    layout: 'centered',
  },
  args: {
    selectedId: null,
    onSelect: () => {},
  },
} satisfies Meta<typeof ApprovalQueuePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: several waiting runs with long titles and summaries. */
export const LongContentQueue: Story = {
  args: {
    selectedId: 'run-2',
    artifacts: ['run-1', 'run-2', 'run-3'].map(id =>
      buildPendingApprovalArtifact({
        id,
        title: LONG_RUN_TITLE,
        summary: LONG_RUN_SUMMARY,
      })
    ),
  },
};

/** Right-to-left: the queue inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    artifacts: [
      buildPendingApprovalArtifact({
        title: 'مراجعة تغييرات لوحة الإدارة',
        summary: 'دفعة تغطية القصص لمكونات الإدارة.',
      }),
    ],
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
