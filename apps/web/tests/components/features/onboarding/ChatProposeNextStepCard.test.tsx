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
  AuthShell: () => <div data-testid='waitlist-signup'>signup</div>,
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
    expect(screen.getByText(/you are not on the list/i)).toBeInTheDocument();
    expect(screen.queryByText(/you're on the list/i)).not.toBeInTheDocument();
  });

  it('shows a non-terminal saving state after authentication', () => {
    authState.isSignedIn = true;
    render(<ChatProposeNextStepCard payload={waitlistPayload} />);

    expect(screen.getByText(/saving your request/i)).toBeInTheDocument();
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
});
