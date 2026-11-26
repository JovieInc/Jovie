import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { AudienceTypeBadge } from './AudienceTypeBadge';

/** Rendered states of the audience type badge beyond the per-type stories. */
const meta = {
  title: 'Organisms/Table/Atoms/AudienceTypeBadge/States',
  component: AudienceTypeBadge,
  parameters: { layout: 'centered' },
  args: { type: 'email' },
} satisfies Meta<typeof AudienceTypeBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

function NarrowFrame({ children }: Readonly<{ children: ReactNode }>) {
  return <div className='w-24'>{children}</div>;
}

function withNarrowFrame(StoryFn: () => ReactNode) {
  return <NarrowFrame>{StoryFn()}</NarrowFrame>;
}

function RtlFrame({ children }: Readonly<{ children: ReactNode }>) {
  return <div dir='rtl'>{children}</div>;
}

function withRtlFrame(StoryFn: () => ReactNode) {
  return <RtlFrame>{StoryFn()}</RtlFrame>;
}

/** Long content: the longest label in a narrow column. */
export const LongContentNarrowColumn: Story = {
  args: { type: 'anonymous' },
  decorators: [withNarrowFrame],
};

/** Rtl: the dot leads on the right edge of a right-to-left row. */
export const RtlSms: Story = {
  args: { type: 'sms' },
  decorators: [withRtlFrame],
};
