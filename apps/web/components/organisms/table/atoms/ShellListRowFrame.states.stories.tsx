import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ShellListRowFrame } from './ShellListRowFrame';

const meta = {
  title: 'Organisms/Table/Atoms/ShellListRowFrame/States',
  component: ShellListRowFrame,
  parameters: { layout: 'centered' },
  decorators: [
    function RowWidth(Story) {
      return (
        <div className='w-72 bg-surface-0 p-3 text-primary-token'>
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof ShellListRowFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a row frame with no content keeps its minimum height. */
export const Empty: Story = {
  args: { chrome: 'shell', density: 'standard' },
};

/** Partial: a plain, non-interactive row with only a title. */
export const Partial: Story = {
  args: {
    chrome: 'plain',
    interactive: false,
    children: <span className='px-3 text-sm'>Untitled release</span>,
  },
};

/** LongContent: a long title truncates instead of widening the row. */
export const LongContent: Story = {
  args: {
    chrome: 'shell',
    density: 'standard',
    interactive: true,
    children: (
      <span className='min-w-0 flex-1 truncate px-3 text-sm'>
        An unusually long release title that must truncate inside the row frame
      </span>
    ),
  },
};

/** Rtl: row content flows from the right edge. */
export const Rtl: Story = {
  args: {
    chrome: 'shell',
    density: 'standard',
    children: <span className='px-3 text-sm'>عنوان الإصدار</span>,
  },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
