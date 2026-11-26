import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { DropDateChip } from './DropDateChip';

/** Rendered states of the drop date chip beyond the per-tone stories. */
const meta = {
  title: 'Shell/DropDateChip/States',
  component: DropDateChip,
  parameters: { layout: 'centered' },
  args: { label: 'Drops in 4 days', tone: 'soon' },
} satisfies Meta<typeof DropDateChip>;

export default meta;
type Story = StoryObj<typeof meta>;

function RtlFrame({ children }: Readonly<{ children: ReactNode }>) {
  return <div dir='rtl'>{children}</div>;
}

function withRtlFrame(StoryFn: () => ReactNode) {
  return <RtlFrame>{StoryFn()}</RtlFrame>;
}

/** Empty: an undated release shows the TBD label. */
export const EmptyTbd: Story = { args: { label: 'TBD', tone: 'future' } };

/** Long content: a long label and a multi-year relative age. */
export const LongContentYearsAgo: Story = {
  args: { label: '2193d ago', tone: 'past' },
};

/** Rtl: the icon and label mirror in a right-to-left row. */
export const RtlLabel: Story = {
  args: { label: 'يصدر بعد ٤ أيام', tone: 'soon' },
  decorators: [withRtlFrame],
};
