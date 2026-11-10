import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingProfileRail } from '@/components/features/onboarding/OnboardingProfileRailLazy';
import {
  EMPTY_ONBOARDING_PROFILE_BUILDER_STATE,
  type OnboardingProfileBuilderState,
} from '@/components/features/onboarding/onboardingProfileRailState';

vi.mock('@/components/features/onboarding/OnboardingProfileRail', () => ({
  OnboardingProfileRail: ({
    placement,
  }: {
    readonly placement?: 'inline' | 'side';
  }) => (
    <aside data-testid='onboarding-profile-rail' data-placement={placement} />
  ),
}));

const HANDLE_STATE: OnboardingProfileBuilderState = {
  artist: null,
  artistConfirmed: false,
  handle: 'newartist',
  socialLinks: [],
};

/**
 * /start TBT guard. The draft-profile preview pulls in the profile surface,
 * the social icon set and their helpers, which was most of the /start client
 * code. A fresh visit has no preview artist, so none of it should load until
 * there is something to show.
 */
describe('OnboardingProfileRail (lazy)', () => {
  it('renders nothing and loads nothing for a fresh visit', () => {
    const { container } = render(
      <OnboardingProfileRail state={EMPTY_ONBOARDING_PROFILE_BUILDER_STATE} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  // First so the lazy chunk is still loading (React caches it once resolved).
  it('holds the side rail width while the chunk loads', async () => {
    render(<OnboardingProfileRail state={HANDLE_STATE} />);
    expect(
      screen.getByTestId('onboarding-profile-rail-placeholder')
    ).toHaveAttribute('aria-hidden', 'true');
    expect(
      await screen.findByTestId('onboarding-profile-rail')
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('onboarding-profile-rail-placeholder')
    ).not.toBeInTheDocument();
  });

  it('loads the rail once there is a preview artist', async () => {
    render(<OnboardingProfileRail placement='inline' state={HANDLE_STATE} />);
    expect(
      await screen.findByTestId('onboarding-profile-rail')
    ).toHaveAttribute('data-placement', 'inline');
  });

  it('keeps the heavy rail out of the shell and chat entry imports', () => {
    for (const file of ['OnboardingShell.tsx', 'OnboardingChat.tsx']) {
      const source = readFileSync(
        path.resolve(
          __dirname,
          '../../../components/features/onboarding',
          file
        ),
        'utf8'
      );
      expect(source).not.toMatch(/from '\.\/OnboardingProfileRail'/);
      expect(source).toMatch(/from '\.\/OnboardingProfileRailLazy'/);
    }
  });
});
