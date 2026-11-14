import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ProfilePrimaryTabPanel } from './ProfilePrimaryTabPanel';
import {
  PROFILE_STORY_ARTIST,
  PROFILE_STORY_CONTENT_PREFS,
} from './profile-story-fixture';

vi.mock('@/features/profile/TourModePanel', () => ({
  TourDrawerContent: () => <div data-testid='mock-tour-drawer-content' />,
  TourEventAlertsAction: () => (
    <div data-testid='mock-tour-event-alerts-action' />
  ),
}));

vi.mock(
  '@/features/profile/artist-notifications-cta/ArtistNotificationsCTA',
  () => ({
    ArtistNotificationsCTA: ({
      triggerLabel,
    }: {
      readonly triggerLabel?: string;
    }) => (
      <button type='button' data-testid='mock-artist-notifications-cta'>
        {triggerLabel ?? 'Get Alerts'}
      </button>
    ),
  })
);

vi.mock('@/features/profile/AboutSection', () => ({
  AboutSection: () => <p data-testid='mock-about-section'>About copy</p>,
}));

vi.mock('@/features/profile/views/ReleasesView', () => ({
  ReleasesView: () => <div data-testid='mock-releases-view' />,
}));

const originalLocation = globalThis.location;

afterEach(() => {
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: originalLocation,
  });
});

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof ProfilePrimaryTabPanel>> = {}
) {
  return render(
    <ProfilePrimaryTabPanel
      mode='listen'
      artist={PROFILE_STORY_ARTIST}
      dsps={[]}
      isSubscribed={false}
      contentPrefs={PROFILE_STORY_CONTENT_PREFS}
      onTogglePref={vi.fn()}
      onUnsubscribe={vi.fn()}
      isUnsubscribing={false}
      {...overrides}
    />
  );
}

describe('ProfilePrimaryTabPanel states', () => {
  it('reloads the page when Try Again is pressed after a failed catalog read', async () => {
    const reload = vi.fn();
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { ...originalLocation, reload },
    });
    const user = userEvent.setup();
    renderPanel({ catalogLoadFailed: true });

    expect(
      screen.getByTestId('profile-primary-tab-music-error')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try Again' }));

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('keeps Try Again inert in a preview', () => {
    renderPanel({ catalogLoadFailed: true, renderMode: 'preview' });

    expect(screen.getByRole('button', { name: 'Try Again' })).toBeDisabled();
  });

  it('offers music alerts when there is no music and nowhere to stream', () => {
    renderPanel();

    expect(
      screen.getByTestId('profile-primary-tab-music-empty')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Turn On Music Alerts' })
    ).toBeEnabled();
  });

  it('disables the music alerts action in a preview', () => {
    renderPanel({ renderMode: 'preview' });

    expect(
      screen.getByRole('button', { name: 'Turn On Music Alerts' })
    ).toBeDisabled();
  });

  it('has no accessibility violations empty, in error, on About and on Events', async () => {
    const empty = renderPanel();
    await expectNoA11yViolations(empty.container);
    empty.unmount();

    const failed = renderPanel({ catalogLoadFailed: true });
    await expectNoA11yViolations(failed.container);
    failed.unmount();

    const about = renderPanel({ mode: 'about' });
    await expectNoA11yViolations(about.container);
    about.unmount();

    const events = renderPanel({ mode: 'tour' });
    await expectNoA11yViolations(events.container);
  });
});
