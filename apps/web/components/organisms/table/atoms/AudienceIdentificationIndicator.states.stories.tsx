import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { AudienceIdentificationIndicator } from './AudienceIdentificationIndicator';

/** Rendered states of the identification indicator beyond the per-level stories. */
const meta = {
  title: 'Organisms/Table/Atoms/AudienceIdentificationIndicator/States',
  component: AudienceIdentificationIndicator,
  parameters: { layout: 'centered' },
  args: {
    type: 'customer',
    hasEmail: true,
    hasPhone: false,
    spotifyConnected: false,
  },
} satisfies Meta<typeof AudienceIdentificationIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

function RtlFrame({ children }: Readonly<{ children: ReactNode }>) {
  return <div dir='rtl'>{children}</div>;
}

function withRtlFrame(StoryFn: () => ReactNode) {
  return <RtlFrame>{StoryFn()}</RtlFrame>;
}

/** Empty: no email, phone or Spotify link leaves the member anonymous. */
export const EmptyNoContactSignals: Story = {
  args: { type: 'anonymous', hasEmail: false },
};

/** Long content: the longest label, Identified, in a narrow column. */
export const LongContentNarrowColumn: Story = {
  decorators: [
    function withNarrowFrame(StoryFn: () => ReactNode) {
      return <div className='w-20'>{StoryFn()}</div>;
    },
  ],
};

/** Rtl: icon and label mirror in a right-to-left row. */
export const RtlIdentified: Story = { decorators: [withRtlFrame] };
