import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { MetaPill } from './MetaPill';

/** Rendered states of the meta pill beyond the default story. */
const meta = {
  title: 'Shell/MetaPill/States',
  component: MetaPill,
  parameters: { layout: 'centered' },
  args: { children: '3 subtasks' },
} satisfies Meta<typeof MetaPill>;

export default meta;
type Story = StoryObj<typeof meta>;

function RtlFrame({ children }: Readonly<{ children: ReactNode }>) {
  return <div dir='rtl'>{children}</div>;
}

function withRtlFrame(StoryFn: () => ReactNode) {
  return <RtlFrame>{StoryFn()}</RtlFrame>;
}

/** Partial: only children, so the neutral tone and no extra class apply. */
export const PartialChildrenOnly: Story = {};

/** Long content: a long single-line label never wraps (whitespace-nowrap). */
export const LongContentNoWrap: Story = {
  args: {
    tone: 'amber',
    children: 'Two release assets are due soon and one pitch is overdue',
  },
};

/** Rtl: the pill in a right-to-left row. */
export const RtlTone: Story = {
  args: { tone: 'cyan', children: 'مهمة فرعية' },
  decorators: [withRtlFrame],
};
