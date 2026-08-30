import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';
import { TourModePanel } from './TourModePanel';

const meta: Meta<typeof TourModePanel> = {
  title: 'Profile/TourModePanel',
  component: TourModePanel,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['disabled'],
    },
  },
  args: {
    artist: PROFILE_STORY_ARTIST,
    tourDates: [],
  },
};

export default meta;

export const Empty: StoryObj<typeof TourModePanel> = {};
