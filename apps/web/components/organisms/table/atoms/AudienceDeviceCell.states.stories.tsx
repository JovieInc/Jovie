import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { AudienceDeviceCell } from './AudienceDeviceCell';

/** Rendered states of the device cell beyond its three device icons. */
const meta = {
  title: 'Organisms/Table/Atoms/AudienceDeviceCell/States',
  component: AudienceDeviceCell,
  parameters: { layout: 'centered' },
  args: { deviceType: 'mobile' },
} satisfies Meta<typeof AudienceDeviceCell>;

export default meta;
type Story = StoryObj<typeof meta>;

function RtlFrame({ children }: Readonly<{ children: ReactNode }>) {
  return <div dir='rtl'>{children}</div>;
}

function withRtlFrame(StoryFn: () => ReactNode) {
  return <RtlFrame>{StoryFn()}</RtlFrame>;
}

/** Long content: a device string no icon matches falls back to the dash. */
export const LongContentUnmatchedDevice: Story = {
  args: {
    deviceType:
      'Experimental wearable companion display running a nonstandard operating system',
  },
};

/** Rtl: the icon cell inside a right-to-left table row. */
export const RtlTablet: Story = {
  args: { deviceType: 'tablet' },
  decorators: [withRtlFrame],
};
