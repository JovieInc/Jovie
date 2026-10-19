import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  OnboardingChatEmptyIntro,
  OnboardingComposerAmbientMark,
} from '@/components/features/onboarding/OnboardingChatEmptyIntro';
import { ONBOARDING_ENTRY_TITLE } from '@/lib/onboarding/empty-state';

describe('OnboardingChatEmptyIntro', () => {
  it.each(['prompt_handoff', 'spotify_handoff'] as const)(
    'does not report a %s draft as sent before transport acceptance (JOV-7771)',
    mode => {
      render(<OnboardingChatEmptyIntro mode={mode} />);

      expect(screen.getAllByRole('heading')).toHaveLength(1);
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.queryByText('Your message is on its way.')).toBeNull();
      expect(screen.queryByText('Preparing your first message')).toBeNull();
    }
  );

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

  it('shows the first-message draft without claiming it has been sent', () => {
    render(<OnboardingChatEmptyIntro mode='spotify_handoff' />);

    expect(
      screen.getByRole('heading', { name: 'Your first message' })
    ).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
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
