import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { TypeBadge } from './TypeBadge';

const row: Decorator = function ReleaseRow(Story) {
  return (
    <div className='flex w-40 items-center gap-2'>
      <span className='min-w-0 truncate text-xs text-primary-token'>
        Never Say A Word
      </span>
      <Story />
    </div>
  );
};

const rtl: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

/** State coverage for the type pill; Default lives in TypeBadge.stories.tsx. */
const meta = {
  title: 'Shell/TypeBadge States',
  component: TypeBadge,
  parameters: { layout: 'centered', jovie: { uncoveredProps: ['label'] } },
  args: { label: 'single' },
} satisfies Meta<typeof TypeBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: a long type label stays one line and never shrinks in a narrow row. */
export const LongContentLabel: Story = {
  args: { label: 'deluxe anniversary edition' },
  decorators: [row],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('deluxe anniversary edition')
    ).toHaveClass('shrink-0');
  },
};

/** Right-to-left: an Arabic type label in an RTL row. */
export const RtlArabic: Story = {
  args: { label: 'ألبوم' },
  decorators: [rtl],
};
