import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AlertsSettingsView } from './AlertsSettingsView';
import {
  PROFILE_STORY_CONTENT_PREFS,
  profileStoryNoop,
} from './profile-story-fixture';

const meta: Meta<typeof AlertsSettingsView> = {
  title: 'Profile/AlertsSettingsView',
  component: AlertsSettingsView,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['disabled'],
    },
  },
  args: {
    presentation: 'embedded',
    isSubscribed: true,
    contentPrefs: PROFILE_STORY_CONTENT_PREFS,
    onTogglePref: profileStoryNoop,
    onUnsubscribe: profileStoryNoop,
    isUnsubscribing: false,
  },
};

export default meta;

export const Manage: StoryObj<typeof AlertsSettingsView> = {
  render: args => (
    <div className='w-full max-w-md bg-base p-6'>
      <AlertsSettingsView {...args} />
    </div>
  ),
};
