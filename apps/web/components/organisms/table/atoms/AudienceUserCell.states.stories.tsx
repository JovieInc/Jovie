import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { AudienceUserCell } from './AudienceUserCell';

/** Rendered states of the audience user cell beyond the default stories. */
const meta = {
  title: 'Organisms/Table/Atoms/AudienceUserCell/States',
  component: AudienceUserCell,
  parameters: { layout: 'centered' },
  args: { displayName: 'Jamie Rivera', type: 'email' },
} satisfies Meta<typeof AudienceUserCell>;

export default meta;
type Story = StoryObj<typeof meta>;

function NarrowFrame({
  children,
  dir,
}: Readonly<{ children: ReactNode; dir?: 'rtl' }>) {
  return (
    <div dir={dir} className='w-40'>
      {children}
    </div>
  );
}

function withNarrowFrame(StoryFn: () => ReactNode) {
  return <NarrowFrame>{StoryFn()}</NarrowFrame>;
}

function withRtlFrame(StoryFn: () => ReactNode) {
  return <NarrowFrame dir='rtl'>{StoryFn()}</NarrowFrame>;
}

/** Empty: an identified member without a display name falls back to a generic label. */
export const EmptyNoDisplayName: Story = {
  args: { displayName: null, type: 'sms' },
};

/** Partial: an anonymous visitor with a device but no location. */
export const PartialDeviceOnly: Story = {
  args: { displayName: null, type: 'anonymous', deviceType: 'tablet' },
};

/** Long content: a long name truncates beside the bot pill and type dot. */
export const LongContentTruncatedName: Story = {
  args: {
    displayName: 'Alexandria Montgomery-Featherstonehaugh the Third',
    tags: ['bot'],
    showTypeDot: true,
  },
  decorators: [withNarrowFrame],
};

/** Rtl: the icon and name mirror in a right-to-left row. */
export const RtlName: Story = {
  args: { displayName: 'جيمي ريفيرا', showTypeDot: true },
  decorators: [withRtlFrame],
};
