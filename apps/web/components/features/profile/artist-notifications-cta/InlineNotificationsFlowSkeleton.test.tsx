import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { COUNTRY_OPTIONS } from '@/features/profile/notifications';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { InlineNotificationsFlowSkeleton } from './InlineNotificationsFlowSkeleton';
import { ProfileMobileNotificationsFlow } from './ProfileMobileNotificationsFlow';

vi.unmock('motion/react');

function renderLiveEmailStep() {
  const noop = vi.fn();
  return render(
    <ProfileMobileNotificationsFlow
      open
      presentation='inline'
      artistName='Tim White'
      channel='email'
      country={COUNTRY_OPTIONS[0]}
      step='email'
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
      contentPrefs={{
        newMusic: true,
        tourDates: true,
        merch: true,
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
      onDismissCapture={noop}
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
    />
  );
}

// Class chain from the flow root down to the compact step's field group.
function layoutChain(root: Element): string[] {
  const body = root.querySelector(':scope > div');
  const header = body?.firstElementChild;
  const step = header?.nextElementSibling;
  const shell = step?.firstElementChild;
  const group = shell?.firstElementChild;
  return [root, body, header, step, shell, group].map(
    node => node?.getAttribute('class') ?? 'missing'
  );
}

describe('InlineNotificationsFlowSkeleton', () => {
  it('lays out the skeleton with the live email step classes, so the swap moves nothing below it', () => {
    const { container: skeleton } = render(<InlineNotificationsFlowSkeleton />);
    const { container: live } = renderLiveEmailStep();

    const skeletonRoot = skeleton.querySelector(
      '[data-testid="profile-mobile-notifications-flow-skeleton"]'
    );
    const liveRoot = live.querySelector(
      '[data-testid="profile-mobile-notifications-flow"]'
    );
    expect(skeletonRoot).not.toBeNull();
    expect(liveRoot).not.toBeNull();
    expect(layoutChain(skeletonRoot as Element)).toEqual(
      layoutChain(liveRoot as Element)
    );
  });

  it('announces loading and shows none of the form copy', () => {
    render(<InlineNotificationsFlowSkeleton />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Loading subscription form')).toBeInTheDocument();
    expect(screen.queryByText('Get updates')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('has no axe violations in the loading state', async () => {
    const { container } = render(<InlineNotificationsFlowSkeleton />);
    await expectNoA11yViolations(container);
  });
});
