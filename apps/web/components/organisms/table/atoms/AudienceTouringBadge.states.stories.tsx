import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { AudienceTouringBadge } from './AudienceTouringBadge';

/** Rendered states of the touring badge beyond the default and no-date stories. */
const meta = {
  title: 'Organisms/Table/Atoms/AudienceTouringBadge/States',
  component: AudienceTouringBadge,
  parameters: { layout: 'centered' },
  args: { touringCity: 'Austin, TX', showDate: '2026-11-14' },
} satisfies Meta<typeof AudienceTouringBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

function RtlFrame({ children }: Readonly<{ children: ReactNode }>) {
  return <div dir='rtl'>{children}</div>;
}

function withRtlFrame(StoryFn: () => ReactNode) {
  return <RtlFrame>{StoryFn()}</RtlFrame>;
}

/** Empty: no upcoming show, so the badge renders nothing. */
export const EmptyNoShow: Story = {
  args: { touringCity: null, showDate: null },
};

/** Long content: a long city name truncates inside the badge width. */
export const LongContentCityName: Story = {
  args: {
    touringCity: 'Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch',
  },
};

/** Rtl: the pin and city mirror in a right-to-left row. */
export const RtlBadge: Story = { decorators: [withRtlFrame] };
