import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { AdminCreatorsTableHeader } from './AdminCreatorsTableHeader';

const meta = {
  title: 'Features/Admin/Table/AdminCreatorsTableHeader/States',
  component: AdminCreatorsTableHeader,
  parameters: { layout: 'centered' },
  args: {
    sort: 'created_desc',
    headerCheckboxState: false,
    selectedCount: 0,
    headerElevated: false,
    stickyTopPx: 0,
    onToggleSelectAll: fn(),
    onSortChange: fn(),
  },
  render: function CreatorsHeaderRender(args) {
    return (
      <table>
        <AdminCreatorsTableHeader {...args} />
      </table>
    );
  },
} satisfies Meta<typeof AdminCreatorsTableHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: nothing selected, so the select-all box is unchecked. */
export const EmptySelection: Story = {};

/** Partial: some rows selected leaves the select-all box indeterminate. */
export const PartialSelection: Story = {
  args: { headerCheckboxState: 'indeterminate', selectedCount: 3 },
};

/** Long content: a wide header action replaces the Actions label. */
export const LongContentHeaderActions: Story = {
  args: {
    headerActions: (
      <span className='whitespace-nowrap text-sm'>
        Ingest a creator profile from any connected platform
      </span>
    ),
  },
};

/** Right-to-left: the header row inside an RTL document. */
export const RtlHeader: Story = {
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
