import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

    expect(screen.getByText('Getting your artist ready')).toBeTruthy();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Preparing your first message'
    );
    expect(screen.queryByTestId('onboarding-sign-in-skip')).toBeNull();
  });

  it('renders the Start-only ambient mark outside the entry copy flow', () => {
    render(<OnboardingComposerAmbientMark />);

    expect(screen.getByTestId('onboarding-start-ambient-mark')).toBeTruthy();
  });

  it('shows the real page behind a prebuilt handle instead of a blank prompt', () => {
    render(
      <OnboardingChatEmptyIntro
        mode='handle_entry'
        entryProfile={{
          status: 'claimable',
          handle: 'megaran',
          displayName: 'Mega Ran',
          avatarUrl: null,
          spotifyId: null,
          spotifyUrl: null,
          genres: [],
          socialLinks: ['https://instagram.com/megaran'],
          linkPlatforms: ['instagram', 'twitch'],
          linkCount: 8,
        }}
      />
    );

    expect(screen.getByText('Your page is ready')).toBeTruthy();
    expect(screen.getByText('Mega Ran')).toBeTruthy();
    expect(screen.getByText('jov.ie/megaran')).toBeTruthy();
    expect(screen.getByText('8 links')).toBeTruthy();
    // Desktop shows this page in the rail preview instead.
    expect(screen.getByTestId('onboarding-entry-profile')).toHaveClass(
      'lg:hidden'
    );
    expect(screen.queryByText(ONBOARDING_ENTRY_TITLE)).toBeNull();
  });

  it('tells the visitor a claimed handle is taken', () => {
    render(
      <OnboardingChatEmptyIntro
        mode='handle_entry'
        entryProfile={{
          status: 'claimed',
          handle: 'tim',
          displayName: 'Tim White',
          avatarUrl: null,
        }}
      />
    );

    expect(screen.getByText('This page is taken')).toBeTruthy();
    expect(
      screen.getByTestId('onboarding-entry-profile').dataset.entryStatus
    ).toBe('claimed');
    expect(
      screen.queryByTestId('onboarding-entry-try-another-name')
    ).toBeNull();
  });

  it('invites an open handle without a profile card', () => {
    render(
      <OnboardingChatEmptyIntro
        mode='handle_entry'
        entryProfile={{ status: 'available', handle: 'newartist' }}
      />
    );

    expect(screen.getByText('Claim jov.ie/newartist')).toBeTruthy();
    expect(screen.queryByTestId('onboarding-entry-profile')).toBeNull();
  });

  it('gives a taken handle a next step instead of a dead end', () => {
    const onTryAnotherName = vi.fn();
    render(
      <OnboardingChatEmptyIntro
        mode='handle_entry'
        entryProfile={{
          status: 'claimed',
          handle: 'tim',
          displayName: 'Tim White',
          avatarUrl: null,
        }}
        onTryAnotherName={onTryAnotherName}
      />
    );

    fireEvent.click(screen.getByTestId('onboarding-entry-try-another-name'));
    expect(onTryAnotherName).toHaveBeenCalledTimes(1);
  });
});
