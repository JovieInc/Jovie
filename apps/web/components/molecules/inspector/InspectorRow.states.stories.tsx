import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { InspectorRow } from './InspectorRow';

const column: Decorator = function InspectorColumn(Story) {
  return (
    <div className='w-80 max-w-full'>
      <Story />
    </div>
  );
};

const rtl: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl' lang='ar' className='w-80 max-w-full'>
      <Story />
    </div>
  );
};

/** State coverage for the inspector fact row; Default lives in InspectorRow.stories.tsx. */
const meta = {
  title: 'Molecules/Inspector/InspectorRow States',
  component: InspectorRow,
  decorators: [column],
  args: { label: 'ISRC', value: 'USRC17607839', size: 'sm' as const },
} satisfies Meta<typeof InspectorRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: a long label and a wrapping value on the 96px label column. */
export const LongContentWrappingValue: Story = {
  args: {
    label: 'Recording location',
    value:
      'Electric Lady Studios, Studio A, 52 West 8th Street, Greenwich Village, New York, with overdubs recorded remotely in Los Angeles',
    align: 'start',
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(/Electric Lady Studios/)
    ).toBeVisible();
  },
};

/** Right-to-left: an Arabic fact row in an RTL inspector. */
export const RtlArabic: Story = {
  args: { label: 'الحالة', value: 'تم الإصدار' },
  decorators: [rtl],
};
