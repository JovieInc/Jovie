import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PriorityGlyph } from './PriorityGlyph';

const meta = {
  title: 'Shell/PriorityGlyph/States',
  component: PriorityGlyph,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof PriorityGlyph>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no priority keeps a width-preserving spacer. */
export const Empty: Story = {
  args: { priority: 'none' },
};

/** LongContent: the glyph keeps its size beside a long task title. */
export const LongContent: Story = {
  args: { priority: 'urgent' },
  decorators: [
    function LongTitleRow(Story) {
      return (
        <div className='flex w-full max-w-xs items-center gap-2'>
          <Story />
          <span className='truncate text-sm text-primary-token'>
            Reply to every playlist curator who asked about the new single
          </span>
        </div>
      );
    },
  ],
};

/** Rtl: the glyph sits at the start edge of a right-to-left row. */
export const Rtl: Story = {
  args: { priority: 'high' },
  decorators: [
    function RtlRow(Story) {
      return (
        <div dir='rtl' lang='ar' className='flex w-48 items-center gap-2'>
          <Story />
          <span className='text-sm text-primary-token'>مهمة عاجلة</span>
        </div>
      );
    },
  ],
};
