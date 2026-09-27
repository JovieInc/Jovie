import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { COUNTRY_OPTIONS } from '@/features/profile/notifications';
import { ProfileMobileNotificationsFlow } from './ProfileMobileNotificationsFlow';

const meta: Meta<typeof ProfileMobileNotificationsFlow> = {
  title: 'Profile/ProfileMobileNotificationsFlow',
  component: ProfileMobileNotificationsFlow,
  parameters: {
    layout: 'fullscreen',
    // `disabled` belongs to the internal preference row, driven by saving state.
    jovie: { uncoveredProps: ['disabled'] },
  },
  args: {
    open: true,
    presentation: 'inline',
    artistName: 'Tim White',
    channel: 'email',
    country: COUNTRY_OPTIONS[0],
    step: 'email',
    emailInput: '',
    phoneInput: '',
    otpCode: '',
    nameInput: '',
    birthdayInput: '',
    error: null,
    isSubmitting: false,
    isNameSaving: false,
    isBirthdaySaving: false,
    isPreferencesSaving: false,
    birthdayHintShown: false,
    resendCooldownEnd: 0,
    isResending: false,
    isCountryOpen: false,
    contentPrefs: {
      newMusic: true,
      tourDates: true,
      merch: false,
      general: true,
    },
    onClose: fn(),
    onBack: fn(),
    onChannelChange: fn(),
    onCountryOpenChange: fn(),
    onCountrySelect: fn(),
    onEmailChange: fn(),
    onPhoneChange: fn(),
    onEmailSubmit: fn(),
    onOtpChange: fn(),
    onOtpComplete: fn(),
    onOtpSubmit: fn(),
    onResendOtp: fn(),
    onNameChange: fn(),
    onNameSubmit: fn(),
    onBirthdayChange: fn(),
    onBirthdaySubmit: fn(),
    onTogglePref: fn(),
    onPreferencesSubmit: fn(),
  },
  decorators: [
    Story => (
      <div className='dark min-h-screen max-w-[430px] bg-base text-primary-token'>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ProfileMobileNotificationsFlow>;

export const Email: Story = {};

export const Preferences: Story = {
  args: { step: 'preferences', canEditPreferences: true },
};

export const Done: Story = {
  args: { step: 'done' },
};
