import { TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { AudienceEngagementCell } from './AudienceEngagementCell';

/** Rendered states of the engagement cell beyond the per-level stories. */
const meta = {
  title: 'Organisms/Table/Atoms/AudienceEngagementCell/States',
  component: AudienceEngagementCell,
  parameters: { layout: 'centered' },
  args: { visits: 12, intentLevel: 'high' },
} satisfies Meta<typeof AudienceEngagementCell>;

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

/** Empty: a member with no visits yet and low intent. */
export const EmptyNoVisits: Story = {
  args: { visits: 0, intentLevel: 'low' },
  decorators: [withTooltipFrame],
};

/** Long content: a seven-digit visit count in the narrow cell. */
export const LongContentVisitCount: Story = {
  args: { visits: 1234567, intentLevel: 'medium' },
  decorators: [withTooltipFrame],
};

/** Rtl: the count and icon mirror in a right-to-left row. */
export const RtlEngagement: Story = { decorators: [withRtlFrame] };
