import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingClaimHandoffProvider } from '@/hooks/useOnboardingClaimHandoff';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  ChatProposeNextStepCard,
  type NextStepCardPayload,
} from './ChatProposeNextStepCard';
import type { ClaimStatus } from './useOnboardingClaim';

const { authState } = vi.hoisted(() => ({
  authState: { isSignedIn: false, canRenderClerkUi: true },
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({ isSignedIn: authState.isSignedIn }),
  useCanRenderClerkUi: () => authState.canRenderClerkUi,
}));

vi.mock('@/features/auth', () => ({
  AuthShell: () => (
    <form aria-label='Create your account' data-testid='signup-surface' />
  ),
}));

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

const payload = (
  kind: NextStepCardPayload['decision']['kind']
): NextStepCardPayload => ({
  action: 'propose_next_step',
  decision: { kind, rationale: 'fixture', score: 0.8 },
});

describe('ChatProposeNextStepCard claim handoff (ONB-36/38/40)', () => {
  beforeEach(() => {
    authState.isSignedIn = true;
    authState.canRenderClerkUi = true;
  });

  it('links the conversation for a visitor who is already signed in', async () => {
    const { container } = render(
      <OnboardingClaimHandoffProvider status='pending'>
        <ChatProposeNextStepCard payload={payload('instant_access')} />
      </OnboardingClaimHandoffProvider>
    );

    expect(screen.getByText(/already signed in/i)).toBeInTheDocument();
    expect(screen.queryByTestId('signup-surface')).toBeNull();
    expect(screen.getByTestId('onboarding-claim-handoff-copy')).toHaveAttribute(
      'data-claim-status',
      'pending'
    );
    await expectNoA11yViolations(container);
  });

  it.each([
    ['pending' as ClaimStatus, /saving your request/i, false],
    ['no-op' as ClaimStatus, /reply below so we can finish/i, false],
    [
      'intake-required' as ClaimStatus,
      /name your artist or paste a spotify link/i,
      false,
    ],
    ['error' as ClaimStatus, /couldn't save your request/i, true],
    ['identity-conflict' as ClaimStatus, /belongs to another account/i, true],
  ])(
    'reflects waitlist claim handoff status %s',
    async (status, copy, isAlert) => {
      const { container } = render(
        <OnboardingClaimHandoffProvider status={status}>
          <ChatProposeNextStepCard
            payload={payload('waitlist')}
            claimHandle='wattwhite'
          />
        </OnboardingClaimHandoffProvider>
      );

      const handoff = screen.getByTestId('onboarding-claim-handoff-copy');
      expect(handoff).toHaveTextContent(copy);
      expect(handoff).toHaveAttribute('data-claim-status', status);
      expect(handoff.getAttribute('role')).toBe(isAlert ? 'alert' : null);
      if (status === 'pending') {
        expect(
          screen.getByText(/until the receipt appears/i)
        ).toBeInTheDocument();
      } else {
        expect(
          screen.queryByText(/until the receipt appears/i)
        ).not.toBeInTheDocument();
      }
      expect(screen.queryByTestId('signup-surface')).toBeNull();
      await expectNoA11yViolations(container);
    }
  );

  it('stops promising linking when instant-access claim fails', async () => {
    const { container } = render(
      <OnboardingClaimHandoffProvider status='error'>
        <ChatProposeNextStepCard payload={payload('instant_access')} />
      </OnboardingClaimHandoffProvider>
    );

    expect(screen.queryByText(/linking this conversation/i)).toBeNull();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/couldn't save your request/i);
    await expectNoA11yViolations(container);
  });

  it('names next action when instant-access claim stalls (ONB-38)', async () => {
    const { container } = render(
      <OnboardingClaimHandoffProvider status='no-op'>
        <ChatProposeNextStepCard payload={payload('instant_access')} />
      </OnboardingClaimHandoffProvider>
    );

    expect(screen.queryByText(/linking this conversation/i)).toBeNull();
    const handoff = screen.getByTestId('onboarding-claim-handoff-copy');
    expect(handoff).toHaveTextContent(/reply below so we can finish/i);
    expect(handoff).toHaveAttribute('data-claim-status', 'no-op');
    expect(handoff.getAttribute('role')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('names artist/Spotify next action when intake is required (ONB-40)', async () => {
    const { container } = render(
      <OnboardingClaimHandoffProvider status='intake-required'>
        <ChatProposeNextStepCard payload={payload('instant_access')} />
      </OnboardingClaimHandoffProvider>
    );

    expect(screen.queryByText(/linking this conversation/i)).toBeNull();
    expect(screen.queryByText(/reply below so we can finish/i)).toBeNull();
    const handoff = screen.getByTestId('onboarding-claim-handoff-copy');
    expect(handoff).toHaveTextContent(
      /name your artist or paste a spotify link/i
    );
    expect(handoff).toHaveAttribute('data-claim-status', 'intake-required');
    expect(handoff.getAttribute('role')).toBeNull();
    await expectNoA11yViolations(container);
  });
});
