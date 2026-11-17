import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { DropdownEmptyRow } from './DropdownEmptyRow';

const CanvasFrame: Decorator = function CanvasFrame(Story) {
  return (
    <div className='w-64 rounded-lg bg-surface-0'>
      <Story />
    </div>
  );
};

const RtlFrame: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Molecules/DropdownEmptyRow States',
  component: DropdownEmptyRow,
  parameters: {
    layout: 'centered',
  },
  decorators: [CanvasFrame],
  args: {
    message: 'No options found',
  },
} satisfies Meta<typeof DropdownEmptyRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the note a dropdown shows when a search matches nothing. */
export const EmptySearchResults: Story = {
  args: {
    message: 'No artists match "lofi beats"',
  },
};

/** Long content: a long note wraps inside the fixed-width menu row. */
export const LongContentWrappedMessage: Story = {
  args: {
    message:
      'No playlists match this search yet. Try a shorter name, check the spelling, or connect another streaming account to see more playlists here.',
  },
};

/** Right-to-left: an Arabic note inside an RTL menu. */
export const RtlArabicMessage: Story = {
  args: {
    message: 'لا توجد خيارات مطابقة',
  },
  decorators: [RtlFrame],
};
