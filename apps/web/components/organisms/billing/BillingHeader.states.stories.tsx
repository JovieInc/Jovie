import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { expect, within } from 'storybook/test';
import { BillingHeader } from './BillingHeader';

function Frame(Story: () => ReactNode) {
  return (
    <div className='w-56'>
      <Story />
    </div>
  );
}

function RtlFrame(Story: () => ReactNode) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

/**
 * State coverage for the billing page header. The plan stories stay in
 * BillingHeader.stories.tsx; these change only the width and the document
 * direction around the same header.
 */
const meta = {
  title: 'Organisms/Billing/BillingHeader States',
  component: BillingHeader,
  parameters: {
    layout: 'padded',
  },
  args: {
    plan: 'pro',
  },
} satisfies Meta<typeof BillingHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: the plan sentence wraps inside a narrow column. */
export const LongContentNarrowColumn: Story = {
  decorators: [Frame],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { level: 1, name: 'Billing' })
    ).toBeVisible();
  },
};

/** Right-to-left: the header inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [RtlFrame],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { level: 1, name: 'Billing' })
    ).toBeVisible();
  },
};
