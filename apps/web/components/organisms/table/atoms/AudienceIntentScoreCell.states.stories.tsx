import { TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { AudienceIntentScoreCell } from './AudienceIntentScoreCell';

/** Rendered states of the intent score cell. */
const meta = {
  title: 'Organisms/Table/Atoms/AudienceIntentScoreCell/States',
  component: AudienceIntentScoreCell,
  parameters: { layout: 'centered' },
  args: { intentLevel: 'low' },
} satisfies Meta<typeof AudienceIntentScoreCell>;

export default meta;
type Story = StoryObj<typeof meta>;

function RtlFrame({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <TooltipProvider>
      <div dir='rtl'>{children}</div>
    </TooltipProvider>
  );
}

function withRtlFrame(StoryFn: () => ReactNode) {
  return <RtlFrame>{StoryFn()}</RtlFrame>;
}

/** Rtl: the fixed-width icon cell in a right-to-left row. */
export const RtlIntent: Story = { decorators: [withRtlFrame] };
