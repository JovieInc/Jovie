import { TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { AudienceReturningCell } from './AudienceReturningCell';

/** Rendered states of the returning cell beyond the default stories. */
const meta = {
  title: 'Organisms/Table/Atoms/AudienceReturningCell/States',
  component: AudienceReturningCell,
  parameters: { layout: 'centered' },
  args: { visits: 3 },
} satisfies Meta<typeof AudienceReturningCell>;

export default meta;
type Story = StoryObj<typeof meta>;

function TooltipFrame({
  children,
  dir,
}: Readonly<{ children: ReactNode; dir?: 'rtl' }>) {
  return (
    <TooltipProvider>
      <div dir={dir}>{children}</div>
    </TooltipProvider>
  );
}

function withTooltipFrame(StoryFn: () => ReactNode) {
  return <TooltipFrame>{StoryFn()}</TooltipFrame>;
}

function withRtlFrame(StoryFn: () => ReactNode) {
  return <TooltipFrame dir='rtl'>{StoryFn()}</TooltipFrame>;
}

/** Empty: zero visits reads as a new member. */
export const EmptyNoVisits: Story = {
  args: { visits: 0 },
  decorators: [withTooltipFrame],
};

/** Long content: a very high visit count still shows one icon. */
export const LongContentManyVisits: Story = {
  args: { visits: 1234567 },
  decorators: [withTooltipFrame],
};

/** Rtl: the icon cell in a right-to-left row. */
export const RtlReturning: Story = { decorators: [withRtlFrame] };
