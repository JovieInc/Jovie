import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { AboutView } from './AboutView';
import {
  ABOUT_EMPTY_ARTIST,
  ABOUT_LONG_ARTIST,
  ABOUT_LONG_GENRES,
  ABOUT_RTL_ARTIST,
} from './about-view-state-fixtures';

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
  title: 'Profile/Views/AboutView States',
  component: AboutView,
  parameters: {
    layout: 'fullscreen',
    // Profile views render on the Noir stage; text tokens are white-on-dark.
    themes: { themeOverride: 'dark' },
  },
  decorators: [withStage],
  args: {
    artist: ABOUT_EMPTY_ARTIST,
  },
} satisfies Meta<typeof AboutView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: nothing verified yet, so the empty note shows. */
export const EmptyProfile: Story = {
  args: { artist: ABOUT_EMPTY_ARTIST, genres: [], contacts: [] },
};

/** Long content: a long bio, place names and genre list wrap. */
export const LongContentBio: Story = {
  args: { artist: ABOUT_LONG_ARTIST, genres: ABOUT_LONG_GENRES },
};

/** RTL: an Arabic bio in a right-to-left document. */
export const RtlBio: Story = {
  args: { artist: ABOUT_RTL_ARTIST, genres: ['هاوس'] },
  decorators: [withRtlStage],
};
