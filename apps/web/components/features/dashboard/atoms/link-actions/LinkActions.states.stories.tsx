import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LinkActions } from './LinkActions';

const meta = {
  title: 'Dashboard/Atoms/LinkActions/States',
  component: LinkActions,
  parameters: { layout: 'centered' },
  args: {
    isVisible: true,
    onToggle: () => {},
    onRemove: () => {},
    isOpen: true,
  },
  decorators: [
    function MenuFrame(Story) {
      return (
        <div className='flex h-40 w-56 justify-end'>
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof LinkActions>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no edit handler, so the menu offers only hide and delete. */
export const EmptyNoEditAction: Story = {};

/** Rtl: the menu trigger inside a right-to-left row. */
export const RtlActions: Story = {
  args: { onEdit: () => {}, showDragHandle: true },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
