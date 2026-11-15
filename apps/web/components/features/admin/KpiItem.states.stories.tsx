import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Users } from 'lucide-react';
import { expect, within } from 'storybook/test';
import { KpiItem } from './KpiItem';

/** State coverage for the admin KPI tile; the default lives in KpiItem.stories.tsx. */
const meta = {
  title: 'Features/Admin/KpiItem States',
  component: KpiItem,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-64'>
        <Story />
      </div>
    ),
  ],
  args: {
    title: 'Waitlisted',
    value: '1,842',
    metadata: '+62 this week',
    icon: Users,
  },
} satisfies Meta<typeof KpiItem>;

export default meta;
type Story = StoryObj<typeof meta>;

const LONG_TITLE =
  'Waitlisted creators awaiting a manual review before their invite goes out';
const LONG_METADATA =
  '+62 this week across every acquisition channel, including referrals, paid social and the homepage claim flow';

/** Long content: a long label truncates and long metadata wraps inside the tile. */
export const LongContentLabelAndMetadata: Story = {
  args: {
    title: LONG_TITLE,
    value: '1,234,567,890',
    metadata: LONG_METADATA,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(LONG_TITLE)).toBeVisible();
    await expect(canvas.getByText(LONG_METADATA)).toBeVisible();
  },
};

/** Right-to-left: the tile inside an Arabic RTL document. */
export const RtlArabic: Story = {
  args: {
    title: 'قائمة الانتظار',
    value: '١٬٨٤٢',
    metadata: '+٦٢ هذا الأسبوع',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('قائمة الانتظار')).toBeVisible();
  },
};
