import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingCompleteStep } from '@/components/dashboard/organisms/onboarding/OnboardingCompleteStep';

describe('OnboardingCompleteStep', () => {
  const baseProps = {
    title: "You're live.",
    prompt: 'Your profile is published and ready to share.',
    displayDomain: 'jov.ie',
    handle: 'artist',
    copied: false,
    onGoToDashboard: vi.fn(),
    onCopyLink: vi.fn(),
    spotifyImportStatus: 'idle' as const,
    spotifyImportStage: 0 as const,
    spotifyImportMessage: '',
  };

  it('keeps spotify progress region mounted but hidden while idle', () => {
    render(
      <OnboardingCompleteStep {...baseProps} spotifyImportStatus='idle' />
    );

    const progressRegion = screen.getByText('1/3').closest('div[aria-hidden]');
    expect(progressRegion).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows spotify import progress when import is active', () => {
    render(
      <OnboardingCompleteStep
        {...baseProps}
        spotifyImportStatus='importing'
        spotifyImportStage={1}
        spotifyImportMessage='Importing your latest releases…'
      />
    );

    expect(
      screen.getByText('Importing your latest releases…')
    ).toBeInTheDocument();
    expect(screen.getByText('2/3')).toBeInTheDocument();
  });

  it('disables dashboard action while spotify import is in progress', () => {
    render(
      <OnboardingCompleteStep
        {...baseProps}
        spotifyImportStatus='importing'
        spotifyImportStage={0}
        spotifyImportMessage='Importing your artists…'
      />
    );

    expect(
      screen.getByRole('button', { name: 'Finishing setup...' })
    ).toBeDisabled();
  });

  it('enables dashboard action when spotify import succeeds', () => {
    render(
      <OnboardingCompleteStep
        {...baseProps}
        spotifyImportStatus='success'
        spotifyImportStage={2}
        spotifyImportMessage='All set!'
      />
    );

    expect(
      screen.getByRole('button', { name: 'Go to Dashboard' })
    ).toBeEnabled();
  });
});
