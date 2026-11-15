import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { Stat } from './Stat';

const rtl: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

const narrow: Decorator = function NarrowFrame(Story) {
  return (
    <div className='w-40'>
      <Story />
    </div>
  );
};

/** State coverage for the label-over-value stat; Default, Tabular and Mono live in Stat.stories.tsx. */
const meta = {
  title: 'Shell/Stat States',
  component: Stat,
  parameters: { layout: 'centered' },
  args: { label: 'Clicks', value: '1,247' },
} satisfies Meta<typeof Stat>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no data yet, so the caller passes the em dash placeholder. */
export const EmptyPlaceholderValue: Story = {
  args: { label: 'Saves', value: '—' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Saves')).toBeVisible();
    await expect(canvas.getByText('—')).toBeVisible();
  },
};

/** Partial: only the required label and value, no mono or tabular styling. */
export const PartialRequiredOnly: Story = {
  args: { label: 'Avg / day', value: '178' },
};

/** Long content: a long caption and an unbroken value in a narrow column. */
export const LongContentNarrowColumn: Story = {
  args: {
    label: 'Pre-save conversions from every connected storefront',
    value: '1,234,567,890 listeners across 214 territories',
    tabular: true,
  },
  decorators: [narrow],
};

/** Right-to-left: Arabic caption and value in an RTL document. */
export const RtlArabic: Story = {
  args: { label: 'النقرات', value: '١٬٢٤٧' },
  decorators: [rtl],
};
