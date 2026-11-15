import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { AdminVerificationRequired } from './AdminVerificationRequired';

/** State coverage for the admin step-up notice; its defaults live in AdminVerificationRequired.stories.tsx. */
const meta = {
  title: 'Features/Admin/AdminVerificationRequired States',
  component: AdminVerificationRequired,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-96 bg-surface-1 p-4'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AdminVerificationRequired>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Permission denied: the admin API returned 403, so the data waits on a passkey unlock. */
export const PermissionDeniedStepUpRequired: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'Admin verification required to load this data.'
    );
    await expect(canvas.getByRole('button', { name: 'Unlock' })).toBeEnabled();
  },
};

const LONG_MESSAGE =
  'Admin verification required to load pipeline settings, distributor credentials, payout destinations and every scheduled outreach batch for this workspace.';

/** Long content: a long caller message wraps beside the unlock action. */
export const LongContentMessage: Story = {
  args: { message: LONG_MESSAGE },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(LONG_MESSAGE)).toBeVisible();
  },
};

/** Right-to-left: the notice inside an Arabic RTL document. */
export const RtlArabic: Story = {
  args: { message: 'يلزم تحقق المسؤول لتحميل هذه البيانات.' },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('يلزم تحقق المسؤول لتحميل هذه البيانات.')
    ).toBeVisible();
  },
};
