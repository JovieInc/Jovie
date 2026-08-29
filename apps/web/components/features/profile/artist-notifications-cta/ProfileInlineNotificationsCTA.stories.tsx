import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PROFILE_STORY_ARTIST } from '../profile-story-fixture';
import { ProfileInlineNotificationsCTA } from './ProfileInlineNotificationsCTA';

const meta: Meta<typeof ProfileInlineNotificationsCTA> = {
  title: 'Profile/ProfileInlineNotificationsCTA',
  component: ProfileInlineNotificationsCTA,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['disabled'],
    },
  },
  args: {
    artist: PROFILE_STORY_ARTIST,
    variant: 'button',
    triggerLabel: 'Get Alerts',
  },
};

export default meta;

export const Default: StoryObj<typeof ProfileInlineNotificationsCTA> = {};
