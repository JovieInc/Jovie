import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { PROFILE_STORY_ARTIST } from '../profile-story-fixture';
import { ListenView } from './ListenView';
import {
  LISTEN_VIEW_DSPS,
  LISTEN_VIEW_MANY_DSPS,
} from './listen-view-state-fixtures';

function withStage(Story: () => ReactNode) {
  return (
    <div className='bg-base p-6'>
      <Story />
    </div>
  );
}

function withRtlStage(Story: () => ReactNode) {
  return (
    <div dir='rtl' lang='ar' className='bg-base p-6'>
      <Story />
    </div>
  );
}

const meta = {
  title: 'Profile/Views/ListenView',
  component: ListenView,
  parameters: {
    layout: 'fullscreen',
    // Profile views render on the Noir stage; text tokens are white-on-dark.
    themes: { themeOverride: 'dark' },
  },
  decorators: [withStage],
  args: {
    artist: PROFILE_STORY_ARTIST,
    dsps: LISTEN_VIEW_DSPS,
  },
} satisfies Meta<typeof ListenView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Spotify and Apple Music rows. */
export const Default: Story = {};

/** Empty: no streaming links, so the empty note shows. */
export const EmptyServices: Story = {
  args: { dsps: [] },
};

/** Long content: every streaming service the profile can list. */
export const ManyServices: Story = {
  args: { dsps: LISTEN_VIEW_MANY_DSPS },
};

/** RTL: the service rows in a right-to-left document. */
export const RtlServices: Story = {
  decorators: [withRtlStage],
};
