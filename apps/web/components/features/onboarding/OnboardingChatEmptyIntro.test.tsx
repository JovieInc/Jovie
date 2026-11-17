import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ONBOARDING_ENTRY_TITLE } from '@/lib/onboarding/empty-state';
import type { StartEntryProfile } from '@/lib/onboarding/start-entry-profile';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  OnboardingChatEmptyIntro,
  OnboardingComposerAmbientMark,
} from './OnboardingChatEmptyIntro';

const claimable = (
  overrides: Partial<Extract<StartEntryProfile, { status: 'claimable' }>>
): StartEntryProfile => ({
  status: 'claimable',
  handle: 'megaran',
  displayName: 'Mega Ran',
  avatarUrl: null,
  spotifyId: null,
  spotifyUrl: null,
  genres: [],
  socialLinks: [],
  linkPlatforms: ['instagram', 'twitch'],
  linkCount: 8,
  ...overrides,
});

// State and accessibility coverage for each entry state. Handoff copy
// contracts live in tests/unit/onboarding/OnboardingChatEmptyIntro.test.tsx.
describe('OnboardingChatEmptyIntro states', () => {
  it.each(['blank', 'prompt_handoff', 'spotify_handoff'] as const)(
    'renders the %s entry with one heading',
    async mode => {
      const { container } = render(<OnboardingChatEmptyIntro mode={mode} />);

      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      await expectNoA11yViolations(container);
    }
  );

  it('keeps the logo decorative while a stored intent is restored', async () => {
    const { container } = render(
      <OnboardingChatEmptyIntro mode='restoring_intent' />
    );

    expect(
      screen.getByRole('heading', { name: 'Restoring your start' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Checking the handoff from your last step.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('drops the link row when no public links were found', async () => {
    const { container } = render(
      <OnboardingChatEmptyIntro
        mode='handle_entry'
        entryProfile={claimable({ linkPlatforms: [], linkCount: 0 })}
      />
    );

    expect(screen.getByText('Your page is ready')).toBeInTheDocument();
    expect(screen.queryByText(/\d+ links?$/)).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('shows a single link for a partial page with no photo', async () => {
    const { container } = render(
      <OnboardingChatEmptyIntro
        mode='handle_entry'
        entryProfile={claimable({ linkPlatforms: ['instagram'], linkCount: 1 })}
      />
    );

    expect(screen.getByText('1 link')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('truncates a long name and caps the platform icons at six', async () => {
    const displayName = 'The Extraordinarily Long Artist Name That Keeps Going';
    const { container } = render(
      <OnboardingChatEmptyIntro
        mode='handle_entry'
        entryProfile={claimable({
          displayName,
          handle: 'theextraordinarilylongartistnamethatkeepsgoing',
          linkPlatforms: [
            'instagram',
            'tiktok',
            'youtube',
            'spotify',
            'soundcloud',
            'twitch',
            'bandcamp',
          ],
          linkCount: 42,
        })}
      />
    );

    expect(screen.getByText(displayName)).toHaveClass('truncate');
    expect(screen.getByText('42 links')).toBeInTheDocument();
    const iconRow = screen.getByText('42 links').parentElement;
    expect(iconRow?.querySelectorAll('svg').length).toBeLessThanOrEqual(6);
    await expectNoA11yViolations(container);
  });

  it('invites an open handle without a profile card', async () => {
    const { container } = render(
      <OnboardingChatEmptyIntro
        mode='handle_entry'
        entryProfile={{ status: 'available', handle: 'newartist' }}
      />
    );

    expect(
      screen.getByRole('heading', { name: 'Claim jov.ie/newartist' })
    ).toBeInTheDocument();
    expect(screen.queryByTestId('onboarding-entry-profile')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('sends a taken handle to the composer from a right-to-left page', async () => {
    const user = userEvent.setup();
    const onTryAnotherName = vi.fn();
    const { container } = render(
      <div dir='rtl' lang='ar'>
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
      </div>
    );

    expect(screen.getByText('This page is taken')).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: 'Try Another Name' }));
    expect(onTryAnotherName).toHaveBeenCalledTimes(1);
  });

  it('keeps the ambient mark out of the accessibility tree', async () => {
    const { container } = render(<OnboardingComposerAmbientMark />);

    expect(screen.getByTestId('onboarding-start-ambient-mark')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    expect(screen.queryByText(ONBOARDING_ENTRY_TITLE)).toBeNull();
    await expectNoA11yViolations(container);
  });
});
