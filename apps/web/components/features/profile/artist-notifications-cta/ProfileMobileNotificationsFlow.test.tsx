import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { COUNTRY_OPTIONS } from '@/features/profile/notifications';
import { ProfileMobileNotificationsFlow } from './ProfileMobileNotificationsFlow';

function renderFlow(
  overrides: Partial<Parameters<typeof ProfileMobileNotificationsFlow>[0]> = {}
) {
  const noop = vi.fn();
  return render(
    <ProfileMobileNotificationsFlow
      open
      presentation='inline'
      artistName='Tim White'
      channel='email'
      country={COUNTRY_OPTIONS[0]}
      step='preferences'
      emailInput=''
      phoneInput=''
      otpCode=''
      nameInput=''
      birthdayInput=''
      error={null}
      isSubmitting={false}
      isNameSaving={false}
      isBirthdaySaving={false}
      isPreferencesSaving={false}
      birthdayHintShown={false}
      resendCooldownEnd={0}
      isResending={false}
      isCountryOpen={false}
      canEditPreferences
      contentPrefs={{
        newMusic: true,
        tourDates: true,
        merch: false,
        general: true,
      }}
      onClose={noop}
      onBack={noop}
      onChannelChange={noop}
      onCountryOpenChange={noop}
      onCountrySelect={noop}
      onEmailChange={noop}
      onPhoneChange={noop}
      onEmailSubmit={noop}
      onOtpChange={noop}
      onOtpComplete={noop}
      onOtpSubmit={noop}
      onResendOtp={noop}
      onNameChange={noop}
      onNameSubmit={noop}
      onBirthdayChange={noop}
      onBirthdaySubmit={noop}
      onTogglePref={noop}
      onPreferencesSubmit={noop}
      {...overrides}
    />
  );
}

describe('ProfileMobileNotificationsFlow', () => {
  it('labels the event preference with the generalized Events copy', () => {
    renderFlow();

    expect(screen.getAllByText('Events').length).toBeGreaterThan(0);
    expect(screen.queryByText('Shows')).toBeNull();
  });
});
