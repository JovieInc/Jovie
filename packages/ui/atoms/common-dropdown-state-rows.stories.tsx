import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { EmptyState, LoadingState } from './common-dropdown-state-rows';

const meta = {
  title: 'UI/Atoms/CommonDropdown/StateRows',
  component: EmptyState,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

/** While the menu's items load: one inert row with a polite status. */
export const Loading: Story = {
  render: () => <LoadingState />,
};

/** When the filter matches nothing. */
export const Empty: Story = {
  render: () => <EmptyState message='No actions found' />,
};

/** A caller message longer than the menu wraps inside the menu width. */
export const LongContent: Story = {
  render: () => (
    <div className='w-64' role='menu' aria-label='Release actions'>
      <EmptyState message='No actions match this search in the summer single menu, including the extended club mix and its territorial variants' />
    </div>
  ),
};

/** A right-to-left caller message follows the page direction inside the menu. */
export const Rtl: Story = {
  render: () => (
    <div className='w-64' dir='rtl' role='menu' aria-label='إجراءات الإصدار'>
      <EmptyState message='لا توجد إجراءات مطابقة لهذا البحث في قائمة الإصدار' />
    </div>
  ),
};
