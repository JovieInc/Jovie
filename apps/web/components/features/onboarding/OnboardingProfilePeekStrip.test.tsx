import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OnboardingProfilePeekStrip } from './OnboardingProfilePeekStrip';
import {
  EMPTY_ONBOARDING_PROFILE_BUILDER_STATE,
  type OnboardingProfileBuilderState,
} from './onboardingProfileRailState';

vi.mock('next/image', () => ({
  default: (props: { readonly src: string; readonly alt: string }) => (
    <img src={props.src} alt={props.alt} />
  ),
}));

const PREVIEW_STATE: OnboardingProfileBuilderState = {
  ...EMPTY_ONBOARDING_PROFILE_BUILDER_STATE,
  artistConfirmed: true,
  handle: 'testartist',
  artist: {
    id: 'a1',
    name: 'Test Artist',
    url: 'https://open.spotify.com/artist/a1',
    imageUrl: 'https://i.scdn.co/image/test',
  },
};

describe('OnboardingProfilePeekStrip', () => {
  it('renders nothing without a preview artist', () => {
    const { container } = render(
      <OnboardingProfilePeekStrip
        state={EMPTY_ONBOARDING_PROFILE_BUILDER_STATE}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows draft identity above the keyboard without Manage chrome', async () => {
    const { container } = render(
      <OnboardingProfilePeekStrip state={PREVIEW_STATE} />
    );

    expect(screen.getByTestId('onboarding-profile-peek-strip')).toBeVisible();
    expect(screen.getByText('Test Artist')).toBeInTheDocument();
    expect(screen.getByText('@testartist')).toBeInTheDocument();
    expect(screen.getByText('Preview')).toBeInTheDocument();
    expect(screen.queryByText('Manage')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
