import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import type { AdminActivityItem } from '@/lib/admin/types';
import { ActivityTableUnified } from './ActivityTableUnified';

const statuses = ['success', 'warning', 'error'] as const;

const manyEvents: AdminActivityItem[] = Array.from({ length: 50 }, (_, i) => ({
  id: `activity-${i + 1}`,
  user: i % 3 === 0 ? 'System' : `@operator-with-a-long-handle-${i + 1}`,
  action: `Re-ran enrichment, refreshed every streaming destination and re-pitched the release to the editorial playlist queue for creator ${i + 1}`,
  timestamp: `${i + 2} minutes ago`,
  status: statuses[i % 3] ?? 'success',
}));

/** State coverage for the admin activity table; Empty, Populated and Loading live in ActivityTableUnified.stories.tsx. */
const meta = {
  title: 'Admin/Activity/ActivityTableUnified States',
  component: ActivityTableUnified,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='min-h-96 p-4'>
        <Story />
      </div>
    ),
  ],
  args: { items: manyEvents.slice(0, 3) },
} satisfies Meta<typeof ActivityTableUnified>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: fifty events with long actions, including failed ones. */
export const LongContentFiftyEvents: Story = {
  args: { items: manyEvents },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText('Error').length).toBeGreaterThan(0);
    // The timestamp renders twice per row (action cell's mobile span and the
    // timestamp cell); query the timestamp cell directly instead of unscoped
    // text.
    await expect(
      canvas.getAllByTestId('admin-activity-timestamp')[49]
    ).toHaveTextContent('50 minutes ago');
  },
};

/** Right-to-left: the table inside an Arabic RTL document. */
export const RtlArabic: Story = {
  args: {
    items: [
      {
        id: 'activity-rtl',
        user: '@مشغل',
        action: 'تمت الموافقة على قائمة تشغيل',
        timestamp: '2 minutes ago',
        status: 'success',
      },
    ],
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('تمت الموافقة على قائمة تشغيل')
    ).toBeVisible();
  },
};
