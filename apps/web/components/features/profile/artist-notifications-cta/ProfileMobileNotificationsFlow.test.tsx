import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { COUNTRY_OPTIONS } from '@/features/profile/notifications';
import { ProfileMobileNotificationsFlow } from './ProfileMobileNotificationsFlow';

// Exercise the actual initial frame; the global Motion stub drops its wrapper.
vi.unmock('motion/react');

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
  it.each(['overlay', 'modal'] as const)(
    'names the %s dialog for the artist whose updates are being requested',
    presentation => {
      renderFlow({ presentation, step: 'email' });

      expect(
        screen.getByRole('dialog', { name: 'Get Updates from Tim White' })
      ).toHaveAttribute('aria-modal', 'true');
    }
  );

  it('opens on a sentence-case Get updates sheet', () => {
    renderFlow({ step: 'email', onDismissCapture: vi.fn() });

    expect(screen.getByText('Get updates')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch to SMS' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeVisible();
  });

  it('keeps the inline flow outside modal dialog semantics', () => {
    renderFlow({ presentation: 'inline', step: 'email' });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('marks the root while the flow is open so the consent card cannot stack over it (JOV-3209)', () => {
    const { unmount } = renderFlow({ presentation: 'inline', step: 'email' });

    expect(
      document.documentElement.getAttribute('data-profile-flow-open')
    ).toBe('true');

    unmount();
    expect(
      document.documentElement.hasAttribute('data-profile-flow-open')
    ).toBe(false);
  });

  it('leaves the root unmarked when the flow is closed', () => {
    renderFlow({ open: false, presentation: 'inline', step: 'email' });

    expect(
      document.documentElement.hasAttribute('data-profile-flow-open')
    ).toBe(false);
  });

  it('makes the capture screen immediately visible without a sliding transition', () => {
    renderFlow({ step: 'email' });

    const captureStep = screen.getByTestId(
      'profile-mobile-notifications-step-email'
    );
    expect(captureStep).toBeVisible();
    expect(getComputedStyle(captureStep).transform).not.toContain('translate');
  });

  it('labels the event preference with the generalized Events copy', () => {
    renderFlow({ availableContent: ['newMusic', 'tourDates', 'merch'] });

    expect(screen.getAllByText('Events').length).toBeGreaterThan(0);
    expect(screen.queryByText('Shows')).toBeNull();
  });

  it('renders alert text with the error token, not raw red-* (JOV-6773)', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'components/features/profile/artist-notifications-cta/ProfileMobileNotificationsFlow.tsx'
      ),
      'utf8'
    );

    expect(source).not.toMatch(/\bred-\d/);
    expect(source).toContain('text-error');
  });

  it('shows only the preference toggles for content the artist has', () => {
    renderFlow();

    expect(screen.getAllByText('New Music').length).toBeGreaterThan(0);
    expect(screen.queryByText('Events')).toBeNull();
    expect(screen.queryByText('Merch')).toBeNull();
  });

  it('shows a save error on the preferences step instead of looking saved', () => {
    renderFlow({ error: 'We could not save your choices. Try again.' });
    expect(screen.getByRole('alert').textContent).toMatch(/could not save/);
  });

  it('describes what the artist toggle really shares', () => {
    renderFlow({ showArtistEmailSection: true });
    expect(screen.getByText(/including ads/)).toBeTruthy();
    expect(screen.getByText(/Off unless you turn it on/)).toBeTruthy();
  });
});

describe('contrast floor (WCAG 1.4.3)', () => {
  it('renders no label or body text below text-white/60 on the dark hero', () => {
    const source = readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        'ProfileMobileNotificationsFlow.tsx'
      ),
      'utf8'
    );

    // text-white/42 measured below 4.5:1 on the hero backdrop (axe
    // color-contrast); 60% white is the floor for label/body text here.
    expect(source).not.toMatch(/text-white\/(?:[0-4]\d|5[0-9])\b/);
    expect(source).toMatch(/text-white\/60/);
  });

  describe('inline loading footprint', () => {
    it('paints the inline email step on its first render instead of an empty frame', () => {
      const markup = renderToStaticMarkup(
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
          onClose={vi.fn()}
          onBack={vi.fn()}
          onChannelChange={vi.fn()}
          onCountryOpenChange={vi.fn()}
          onCountrySelect={vi.fn()}
          onEmailChange={vi.fn()}
          onPhoneChange={vi.fn()}
          onEmailSubmit={vi.fn()}
          onOtpChange={vi.fn()}
          onOtpComplete={vi.fn()}
          onOtpSubmit={vi.fn()}
          onResendOtp={vi.fn()}
          onNameChange={vi.fn()}
          onNameSubmit={vi.fn()}
          onBirthdayChange={vi.fn()}
          onBirthdaySubmit={vi.fn()}
          onTogglePref={vi.fn()}
          onPreferencesSubmit={vi.fn()}
        />
      );

      expect(markup).toContain('data-testid="mobile-email-input"');
    });
  });
});
