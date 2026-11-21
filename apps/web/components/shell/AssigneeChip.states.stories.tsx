import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { AssigneeChip } from './AssigneeChip';

/** Rendered states of the assignee chip beyond the default stories. */
const meta = {
  title: 'Shell/AssigneeChip/States',
  component: AssigneeChip,
  parameters: { layout: 'centered' },
  args: { kind: 'human', expanded: true, name: 'Tim' },
} satisfies Meta<typeof AssigneeChip>;

export default meta;
type Story = StoryObj<typeof meta>;

function RtlFrame({ children }: Readonly<{ children: ReactNode }>) {
  return <div dir='rtl'>{children}</div>;
}

function withRtlFrame(StoryFn: () => ReactNode) {
  return <RtlFrame>{StoryFn()}</RtlFrame>;
}

/** Empty: an unnamed human assignee renders only the optional avatar slot. */
export const EmptyUnnamedHuman: Story = { args: { name: undefined } };

/** Partial: the compact Jovie assignee with no name or expansion. */
export const PartialJovieCompact: Story = {
  args: { kind: 'jovie', expanded: false, name: undefined },
};

/** Long content: a long human name in the expanded detail layout. */
export const LongContentName: Story = {
  args: { name: 'Alexandria Montgomery-Featherstonehaugh the Third' },
};

/** Rtl: the expanded chip in a right-to-left row. */
export const RtlExpanded: Story = {
  args: { name: 'تيم' },
  decorators: [withRtlFrame],
};
