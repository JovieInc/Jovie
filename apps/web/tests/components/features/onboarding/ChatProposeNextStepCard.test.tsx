import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatProposeNextStepCard } from '@/components/features/onboarding/ChatProposeNextStepCard';

const { authState, trackMock } = vi.hoisted(() => ({
  authState: { isSignedIn: false },
  trackMock: vi.fn(),
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({ isSignedIn: authState.isSignedIn }),
  useCanRenderClerkUi: () => true,
}));

vi.mock('@/features/auth', () => ({
  AuthShell: ({
    claimHandle,
    accessKind = 'claim',
  }: {
    claimHandle?: string;
    accessKind?: 'claim' | 'waitlist';
  }) => (
    <div
      data-testid='waitlist-signup'
      data-claim-handle={claimHandle ?? ''}
      data-access-kind={accessKind}
    >
      signup
    </div>
  ),
}));

vi.mock('@/lib/analytics', () => ({ track: trackMock }));

const waitlistPayload = {
  action: 'propose_next_step' as const,
  decision: {
    kind: 'waitlist' as const,
    rationale: 'controlled access',
    score: 30,
  },
};

describe('ChatProposeNextStepCard waitlist truthfulness', () => {
  beforeEach(() => {
    authState.isSignedIn = false;
    trackMock.mockClear();
  });

  it('requires verified signup and never claims the request is saved', () => {
    render(<ChatProposeNextStepCard payload={waitlistPayload} />);

    expect(screen.getByTestId('waitlist-signup')).toBeInTheDocument();
    expect(screen.getByTestId('waitlist-signup')).toHaveAttribute(
      'data-access-kind',
      'waitlist'
    );
    expect(
      screen.getByText(/save this request and reserve your name and profile/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/you are not on the list/i)).toBeInTheDocument();
    expect(screen.getByText(/save your spot/i)).toBeInTheDocument();
    expect(screen.queryByText(/you're on the list/i)).not.toBeInTheDocument();
    expect(
      screen.getByTestId('onboarding-post-keep-enrichment')
    ).toBeInTheDocument();
    expect(
      screen.getByText(/optional — does not change signup/i)
    ).toBeInTheDocument();
  });

  it('shows a non-terminal preparing state after authentication (ONB-46 idle)', () => {
    authState.isSignedIn = true;
    render(<ChatProposeNextStepCard payload={waitlistPayload} />);

    // Without a claim-handoff provider, status stays idle — preparing copy,
    // not forever-receipt while nothing is in flight yet.
    expect(
      screen.getByText(/preparing to save your request/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/until the receipt appears/i)
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/you're on the list/i)).not.toBeInTheDocument();
  });

  it('counts the decision and save start once across authentication', () => {
    const { rerender } = render(
      <ChatProposeNextStepCard payload={waitlistPayload} />
    );
    rerender(<ChatProposeNextStepCard payload={waitlistPayload} />);

    authState.isSignedIn = true;
    rerender(<ChatProposeNextStepCard payload={waitlistPayload} />);
    rerender(<ChatProposeNextStepCard payload={waitlistPayload} />);

    expect(trackMock).toHaveBeenCalledTimes(2);
    expect(trackMock.mock.calls.map(call => call[0])).toEqual([
      'waitlist_decision_rendered',
      'waitlist_save_started',
    ]);
  });

  it('binds the settled handle with waitlist access, not homepage ?handle=', () => {
    // Golden-path cert 2026-10-31 pm: the visitor typed jov.ie/gpwo879d on the
    // homepage, locked @unmarkedpave in chat, and the card said "Claim @gpwo879d".
    // ONB-23: waitlist decisions pass accessKind=waitlist (Reserve, not Claim).
    render(
      <ChatProposeNextStepCard
        payload={waitlistPayload}
        claimHandle='unmarkedpave'
      />
    );
    expect(screen.getByTestId('waitlist-signup')).toHaveAttribute(
      'data-claim-handle',
      'unmarkedpave'
    );
    expect(screen.getByTestId('waitlist-signup')).toHaveAttribute(
      'data-access-kind',
      'waitlist'
    );
  });

  it('marks the AuthShell card as an onboarding auth scroll anchor (ONB-27)', () => {
    const { container, getByTestId } = render(
      <ChatProposeNextStepCard
        payload={waitlistPayload}
        claimHandle='unmarkedpave'
      />
    );
    const anchor = container.querySelector('[data-onboarding-auth-anchor]');
    expect(anchor?.hasAttribute('data-onboarding-auth-anchor')).toBe(true);
    expect(anchor).toContainElement(getByTestId('waitlist-signup'));
    expect(getByTestId('waitlist-signup')).toHaveAttribute(
      'data-access-kind',
      'waitlist'
    );
  });
});
