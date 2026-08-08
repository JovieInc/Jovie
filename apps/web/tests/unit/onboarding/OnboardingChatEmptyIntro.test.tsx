import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  OnboardingChatEmptyIntro,
  OnboardingComposerAmbientMark,
} from '@/components/features/onboarding/OnboardingChatEmptyIntro';
import { ONBOARDING_ENTRY_TITLE } from '@/lib/onboarding/empty-state';

describe('OnboardingChatEmptyIntro', () => {
  it('renders the compact blank entry with its canonical composer', () => {
    render(<OnboardingChatEmptyIntro mode='blank' />);

    expect(screen.getByTestId('onboarding-empty-intro')).toBeTruthy();
    expect(screen.getByText(ONBOARDING_ENTRY_TITLE)).toBeTruthy();
    expect(screen.queryByTestId('onboarding-sign-in-skip')).toBeNull();
    expect(screen.queryByText('Find My Spotify Artist')).toBeNull();
    expect(screen.queryByText('Plan a Release')).toBeNull();
    expect(screen.queryByText('Build Artist Profile')).toBeNull();
    expect(screen.queryByText('Set Up My Link Page')).toBeNull();
    expect(screen.queryByTestId('onboarding-start-ambient-mark')).toBeNull();
  });

  it('replaces blank controls with one stable handoff status', () => {
    render(<OnboardingChatEmptyIntro mode='spotify_handoff' />);

    expect(screen.getByText('Getting Your Artist Ready')).toBeTruthy();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Preparing your first message'
    );
    expect(screen.queryByTestId('onboarding-sign-in-skip')).toBeNull();
  });

  it('renders the Start-only ambient mark outside the entry copy flow', () => {
    render(<OnboardingComposerAmbientMark />);

    expect(screen.getByTestId('onboarding-start-ambient-mark')).toBeTruthy();
  });
});
