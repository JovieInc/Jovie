import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingCompleteStep } from '@/components/dashboard/organisms/onboarding/OnboardingCompleteStep';

describe('OnboardingCompleteStep', () => {
  const baseProps = {
    title: "You're live.",
    prompt: 'Your profile is published and ready to share.',
    displayDomain: 'jovie.fm',
    handle: 'artist',
    copied: false,
    onGoToDashboard: vi.fn(),
    onCopyLink: vi.fn(),
    spotifyImportStatus: 'idle' as const,
    spotifyImportStage: 0 as const,
    spotifyImportMessage: '',
  };

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
});
