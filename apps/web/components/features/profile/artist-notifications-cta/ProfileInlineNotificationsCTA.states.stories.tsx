import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { PROFILE_STORY_ARTIST } from '../profile-story-fixture';
import { ProfileInlineNotificationsCTA } from './ProfileInlineNotificationsCTA';

function RtlFrame({ children }: { readonly children: ReactNode }) {
  return (
    <div dir='rtl' className='w-full max-w-xs'>
      {children}
    </div>
  );
}

function NarrowFrame({ children }: { readonly children: ReactNode }) {
  return <div className='w-full max-w-xs'>{children}</div>;
}

function withRtlFrame(Story: () => ReactNode) {
  return (
    <RtlFrame>
      <Story />
    </RtlFrame>
  );
}

function withNarrowFrame(Story: () => ReactNode) {
  return (
    <NarrowFrame>
      <Story />
    </NarrowFrame>
  );
}

const meta = {
  title: 'Profile/ProfileInlineNotificationsCTA/States',
  component: ProfileInlineNotificationsCTA,
  parameters: { layout: 'centered' },
  args: {
    artist: PROFILE_STORY_ARTIST,
    variant: 'button',
    triggerLabel: 'Get alerts',
  },
} satisfies Meta<typeof ProfileInlineNotificationsCTA>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: an artist with only new music to announce. */
export const PartialNewMusicOnly: Story = {
  args: { availableContent: ['newMusic'] },
};

/** Long content: a trigger label far past the width of its container. */
export const LongContentTriggerLabel: Story = {
  args: {
    triggerLabel:
      'Get an alert the moment a new release, tour date or merch drop goes live',
  },
  decorators: [withNarrowFrame],
};

/** Rtl: the trigger mirrors inside a right-to-left container. */
export const RtlTrigger: Story = {
  args: { triggerLabel: 'تنبيهات الإصدارات الجديدة' },
  decorators: [withRtlFrame],
};
