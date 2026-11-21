import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { priceLockViewFixture } from '@/tests/fixtures/billing/price-lock';
import { PriceLockNote } from './PriceLockNote';

/** Rendered states of the price lock note beyond the default locked price. */
const meta = {
  title: 'Organisms/Billing/PriceLockNote/States',
  component: PriceLockNote,
  parameters: { layout: 'padded' },
  args: { lock: priceLockViewFixture() },
} satisfies Meta<typeof PriceLockNote>;

export default meta;
type Story = StoryObj<typeof meta>;

function RtlFrame({ children }: Readonly<{ children: ReactNode }>) {
  return <div dir='rtl'>{children}</div>;
}

function withRtlFrame(StoryFn: () => ReactNode) {
  return <RtlFrame>{StoryFn()}</RtlFrame>;
}

/** Partial: only the yearly price is locked, shown for the yearly interval. */
export const PartialYearlyOnly: Story = {
  args: {
    interval: 'year',
    lock: priceLockViewFixture({
      monthlyAmountCents: null,
      stripePriceIdMonthly: null,
      yearlyAmountCents: 12000,
      stripePriceIdYearly: 'price_120',
    }),
  },
};

/** Long content: a large amount with cents makes the longest disclosure. */
export const LongContentLargeAmount: Story = {
  args: {
    lock: priceLockViewFixture({ monthlyAmountCents: 1234567 }),
  },
};

/** Rtl: the disclosure aligns to the start edge of a right-to-left page. */
export const RtlLocked: Story = {
  decorators: [withRtlFrame],
};
