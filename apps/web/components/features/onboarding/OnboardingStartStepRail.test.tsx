import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OnboardingStartStepRail } from './OnboardingStartStepRail';
import {
  EMPTY_ONBOARDING_PROFILE_BUILDER_STATE,
  type OnboardingProfileBuilderState,
} from './onboardingProfileRailState';

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { readonly children: React.ReactNode }) => (
    <>{children}</>
  ),
  motion: {
    div: ({
      children,
      ...props
    }: {
      readonly children?: React.ReactNode;
      readonly [key: string]: unknown;
    }) => <div {...props}>{children}</div>,
  },
}));

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

const CLAIM_STATE: OnboardingProfileBuilderState = {
  ...EMPTY_ONBOARDING_PROFILE_BUILDER_STATE,
  artistConfirmed: true,
  handle: 'testartist',
  artist: {
    id: 'a1',
    name: 'Test Artist',
    url: 'https://open.spotify.com/artist/a1',
  },
};

describe('OnboardingStartStepRail', () => {
  it('renders the quiet three-step rail with Claim Your Name active', async () => {
    const { container } = render(
      <OnboardingStartStepRail state={CLAIM_STATE} />
    );

    expect(screen.getByTestId('onboarding-start-step-rail')).toHaveAttribute(
      'data-active-step',
      'claim'
    );
    expect(screen.getByTestId('onboarding-start-step-find')).toHaveAttribute(
      'data-status',
      'done'
    );
    expect(screen.getByTestId('onboarding-start-step-claim')).toHaveAttribute(
      'data-status',
      'active'
    );
    expect(screen.getByTestId('onboarding-start-step-live')).toHaveAttribute(
      'data-status',
      'upcoming'
    );
    expect(screen.getByText('Claim Your Name')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
