import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { AdminReadUnavailable } from './AdminReadUnavailable';

/** State coverage for the failed-read notice; its defaults live in AdminReadUnavailable.stories.tsx. */
const meta = {
  title: 'Features/Admin/AdminReadUnavailable States',
  component: AdminReadUnavailable,
  parameters: { layout: 'padded', nextjs: { appDirectory: true } },
  args: {
    message:
      'Feature flag values could not be read. Changes are unavailable until the current values can be verified.',
  },
} satisfies Meta<typeof AdminReadUnavailable>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Error: the read failed, so the notice offers a retry rather than an empty value. */
export const ErrorReadFailed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'Feature flag values could not be read.'
    );
    await expect(canvas.getByRole('button', { name: 'Retry' })).toBeEnabled();
  },
};

const LONG_MESSAGE =
  'Publisher connection, playlist settings, distributor credentials and every scheduled pitch could not be read. Their status is unknown, not empty, and changes stay unavailable until the current settings can be verified against the source of record.';

/** Long content: a long failure message wraps beside the retry action. */
export const LongContentMessage: Story = {
  args: { message: LONG_MESSAGE },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(LONG_MESSAGE)).toBeVisible();
  },
};

/** Right-to-left: the notice inside an Arabic RTL document. */
export const RtlArabic: Story = {
  args: { message: 'تعذرت قراءة قيم الميزات. التغييرات غير متاحة حاليًا.' },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(
        'تعذرت قراءة قيم الميزات. التغييرات غير متاحة حاليًا.'
      )
    ).toBeVisible();
  },
};
