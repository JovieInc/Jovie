import { TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { AudienceLtvCell } from './AudienceLtvCell';

/** Rendered states of the lifetime value cell beyond the default tiers. */
const meta = {
  title: 'Organisms/Table/Atoms/AudienceLtvCell/States',
  component: AudienceLtvCell,
  parameters: { layout: 'centered' },
  args: {
    tipAmountTotalCents: 4500,
    tipCount: 3,
    visits: 8,
    engagementScore: 72,
  },
} satisfies Meta<typeof AudienceLtvCell>;

export default meta;
type Story = StoryObj<typeof meta>;

function TooltipFrame({
  children,
  dir,
}: Readonly<{ children: ReactNode; dir?: 'rtl' }>) {
  return (
    <TooltipProvider>
      <div dir={dir} className='w-28'>
        {children}
      </div>
    </TooltipProvider>
  );
}

function withTooltipFrame(StoryFn: () => ReactNode) {
  return <TooltipFrame>{StoryFn()}</TooltipFrame>;
}

function withRtlFrame(StoryFn: () => ReactNode) {
  return <TooltipFrame dir='rtl'>{StoryFn()}</TooltipFrame>;
}

/** Empty: no tips, clicks or sales shows the dash placeholder. */
export const EmptyNoValue: Story = {
  args: { tipAmountTotalCents: 0, tipCount: 0, visits: 0, engagementScore: 0 },
  decorators: [withTooltipFrame],
};

/** Partial: only optional merch revenue is known. */
export const PartialMerchOnly: Story = {
  args: {
    tipAmountTotalCents: 0,
    tipCount: 0,
    visits: 1,
    engagementScore: 10,
    merchSalesCents: 2500,
  },
  decorators: [withTooltipFrame],
};

/** Long content: a six-figure value in the narrow cell. */
export const LongContentLargeValue: Story = {
  args: {
    tipAmountTotalCents: 123456789,
    tipCount: 99,
    visits: 400,
    engagementScore: 99,
  },
  decorators: [withTooltipFrame],
};

/** Rtl: the amount aligns to the start edge in a right-to-left row. */
export const RtlValue: Story = { decorators: [withRtlFrame] };
