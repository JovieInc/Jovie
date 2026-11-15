import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { InsightCategoryIcon } from './InsightCategoryIcon';

/**
 * State coverage for InsightCategoryIcon. The chip draws one fixed glyph, so
 * the only caller-controlled state is the direction of the surrounding row.
 */
const meta = {
  title: 'Dashboard/Insights/InsightCategoryIcon States',
  component: InsightCategoryIcon,
  parameters: {
    layout: 'centered',
  },
  args: {
    category: 'growth',
  },
} satisfies Meta<typeof InsightCategoryIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-to-left: the chip leading an RTL insight heading. */
export const RtlDocument: Story = {
  render: args => (
    <div dir='rtl' className='flex items-center gap-3'>
      <InsightCategoryIcon {...args} />
      <span>تسارع نمو الجمهور</span>
      <InsightCategoryIcon category='timing' size='sm' />
    </div>
  ),
};
