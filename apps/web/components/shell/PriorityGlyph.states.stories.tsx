import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { PriorityGlyph } from './PriorityGlyph';

/** Rendered states of the priority glyph beyond the per-level stories. */
const meta = {
  title: 'Shell/PriorityGlyph/States',
  component: PriorityGlyph,
  parameters: { layout: 'centered' },
  args: { priority: 'urgent' },
} satisfies Meta<typeof PriorityGlyph>;

export default meta;
type Story = StoryObj<typeof meta>;

function RtlFrame({ children }: Readonly<{ children: ReactNode }>) {
  return <div dir='rtl'>{children}</div>;
}

function withRtlFrame(StoryFn: () => ReactNode) {
  return <RtlFrame>{StoryFn()}</RtlFrame>;
}

/** Empty: no priority renders the width-preserving spacer. */
export const EmptyNoPriority: Story = { args: { priority: 'none' } };

/** Rtl: the stacked bars in a right-to-left row. */
export const RtlHighBars: Story = {
  args: { priority: 'high' },
  decorators: [withRtlFrame],
};
