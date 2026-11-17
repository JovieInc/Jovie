import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AlertsSettingsView } from './AlertsSettingsView';
import {
  PROFILE_STORY_CONTENT_PREFS,
  profileStoryNoop,
} from './profile-story-fixture';

/**
 * Rendered states of the alerts settings list. The default story lives in
 * AlertsSettingsView.stories.tsx.
 */
const ProfilePanelFrame: Decorator = function ProfilePanelFrame(Story) {
  return (
    <div className='w-full max-w-md bg-base p-6'>
      <Story />
    </div>
  );
};

const NarrowPanelFrame: Decorator = function NarrowPanelFrame(Story) {
  return (
    <div className='w-48'>
      <Story />
    </div>
  );
};

const RtlPanelFrame: Decorator = function RtlPanelFrame(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Profile/AlertsSettingsView/States',
  component: AlertsSettingsView,
  parameters: { layout: 'centered' },
  args: {
    presentation: 'embedded',
    isSubscribed: true,
    contentPrefs: PROFILE_STORY_CONTENT_PREFS,
    onTogglePref: profileStoryNoop,
    onUnsubscribe: profileStoryNoop,
    isUnsubscribing: false,
  },
  decorators: [ProfilePanelFrame],
} satisfies Meta<typeof AlertsSettingsView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: alerts are not on yet, so every switch is off and inert. */
export const EmptyAlertsOff: Story = {
  args: {
    isSubscribed: false,
    contentPrefs: {
      newMusic: false,
      tourDates: false,
      merch: false,
      general: false,
    },
  },
};

/** Partial: alerts are on for some topics only, in the panel presentation. */
export const PartialSomeTopics: Story = {
  args: {
    presentation: 'panel',
    contentPrefs: {
      newMusic: true,
      tourDates: true,
      merch: false,
      general: false,
    },
  },
};

/** The unsubscribe action while it is turning alerts off. */
export const PartialTurningOff: Story = {
  args: { isUnsubscribing: true },
};

/** Long content: the row copy truncates inside a narrow drawer. */
export const LongContentNarrowPanel: Story = {
  decorators: [NarrowPanelFrame],
};

/** Right-to-left: the list in an Arabic document direction. */
export const RtlArabicDocument: Story = {
  args: { presentation: 'panel' },
  decorators: [RtlPanelFrame],
};
