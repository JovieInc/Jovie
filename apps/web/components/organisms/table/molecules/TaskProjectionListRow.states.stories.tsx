import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { TaskProjectionListRow } from './TaskProjectionListRow';

function Leading() {
  return (
    <span className='text-app text-secondary-token' aria-hidden='true'>
      ◷
    </span>
  );
}

/** State coverage for the shared task row anatomy. */
const meta = {
  title: 'Organisms/Table/TaskProjectionListRow States',
  component: TaskProjectionListRow,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TaskProjectionListRow>;
export default meta;
type Story = StoryObj<typeof TaskProjectionListRow>;

/** Partial: no title and no action slot, only metadata. */
export const PartialMetadataOnly: Story = {
  args: {
    testId: 'task-projection-row-partial',
    leading: <Leading />,
    metadata: (
      <span className='text-3xs text-tertiary-token'>JOV-5544 · Attempt 2</span>
    ),
  },
  play: async ({ canvasElement }) => {
    const row = within(canvasElement).getByTestId(
      'task-projection-row-partial'
    );
    await expect(row.querySelector('p')).toBeNull();
    await expect(within(row).getByText('JOV-5544 · Attempt 2')).toBeVisible();
  },
};

/** Long content: a long title truncates beside its metadata and actions. */
export const LongContentTitle: Story = {
  args: {
    testId: 'task-projection-row-long',
    leading: <Leading />,
    title:
      'Cache Symphony workspaces on NVMe, rotate stale runner tokens and rebuild the merge queue dashboards for every repository',
    metadata: (
      <span className='text-3xs text-tertiary-token'>
        JOV-5544 · Attempt 12 · queued for review by the release captain
      </span>
    ),
    actionSlot: (
      <span className='text-3xs text-secondary-token'>queued → running</span>
    ),
  },
  decorators: [
    function NarrowList(Story) {
      return (
        <div className='w-96'>
          <Story />
        </div>
      );
    },
  ],
};

/** Right-to-left: an Arabic task inside an RTL document. */
export const RtlTask: Story = {
  args: {
    testId: 'task-projection-row-rtl',
    leading: <Leading />,
    title: 'تخزين مساحات العمل مؤقتًا',
    metadata: <span className='text-3xs text-tertiary-token'>قيد التشغيل</span>,
    isSelected: true,
  },
  decorators: [
    function RtlDocument(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
