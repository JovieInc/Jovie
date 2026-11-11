import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_FUNNEL_EVENTS } from '@/lib/onboarding/funnel-events';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  ChatProposeNextStepCard,
  type NextStepCardPayload,
} from './ChatProposeNextStepCard';

const { authState, trackMock } = vi.hoisted(() => ({
  authState: { isSignedIn: false, canRenderClerkUi: true },
  trackMock: vi.fn(),
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({ isSignedIn: authState.isSignedIn }),
  useCanRenderClerkUi: () => authState.canRenderClerkUi,
}));

// AuthShell is certified on its own; a labelled form stands in for it here.
vi.mock('@/features/auth', () => ({
  AuthShell: ({ claimHandle }: { claimHandle?: string }) => (
    <form aria-label='Create your account' data-testid='signup-surface'>
      {claimHandle ? <h2>Claim @{claimHandle}</h2> : null}
    </form>
  ),
}));

vi.mock('@/lib/analytics', () => ({ track: trackMock }));

const payload = (
  kind: NextStepCardPayload['decision']['kind']
): NextStepCardPayload => ({
  action: 'propose_next_step',
  decision: { kind, rationale: 'fixture', score: 0.8 },
});

// State and accessibility coverage for each render path. Waitlist
// truthfulness lives in tests/components/features/onboarding.
describe('ChatProposeNextStepCard states', () => {
  beforeEach(() => {
    authState.isSignedIn = false;
    authState.canRenderClerkUi = true;
    trackMock.mockClear();
  });

  it('renders nothing while the model gathers more information', async () => {
    const { container } = render(
      <ChatProposeNextStepCard payload={payload('needs_more_info')} />
    );

    expect(container).toBeEmptyDOMElement();
    expect(trackMock).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('offers inline sign-up on instant access and counts the qualification', async () => {
    const { container } = render(
      <ChatProposeNextStepCard
        payload={payload('instant_access')}
        claimHandle='timwhite'
      />
    );

    expect(
      screen.getByText(/add an email to save your profile/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Claim @timwhite' })
    ).toBeInTheDocument();
    expect(trackMock).toHaveBeenCalledWith(
      ONBOARDING_FUNNEL_EVENTS.QUALIFIED,
      expect.objectContaining({ surface: 'start_chat' })
    );
    await expectNoA11yViolations(container);
  });

  it('keeps the instant-access copy when the auth surface cannot render', async () => {
    authState.canRenderClerkUi = false;
    const { container } = render(
      <ChatProposeNextStepCard payload={payload('instant_access')} />
    );

    expect(
      screen.getByText(/create your account to keep this conversation/i)
    ).toBeInTheDocument();
    expect(screen.queryByTestId('signup-surface')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('links the conversation for a visitor who is already signed in', async () => {
    authState.isSignedIn = true;
    const { container } = render(
      <ChatProposeNextStepCard payload={payload('instant_access')} />
    );

    expect(screen.getByText(/already signed in/i)).toBeInTheDocument();
    expect(screen.queryByTestId('signup-surface')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it.each([
    [true, true, /saving your request/i],
    [false, false, /save your spot/i],
    [false, true, /save your spot/i],
  ])(
    'renders the waitlist path (signed in %s, auth ui %s) without violations',
    async (signedIn, canRender, copy) => {
      authState.isSignedIn = signedIn;
      authState.canRenderClerkUi = canRender;
      const { container } = render(
        <ChatProposeNextStepCard payload={payload('waitlist')} />
      );

      expect(screen.getByText(copy)).toBeInTheDocument();
      expect(Boolean(screen.queryByTestId('signup-surface'))).toBe(
        !signedIn && canRender
      );
      await expectNoA11yViolations(container);
    }
  );

  it('carries a long settled handle into the sign-up heading', async () => {
    const handle = 'theextraordinarilylongartistnamethatkeepsgoing';
    const { container } = render(
      <ChatProposeNextStepCard
        payload={payload('instant_access')}
        claimHandle={handle}
      />
    );

    expect(
      screen.getByRole('heading', { name: `Claim @${handle}` })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders the waitlist sign-up inside a right-to-left page', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ChatProposeNextStepCard payload={payload('waitlist')} />
      </div>
    );

    expect(screen.getByTestId('signup-surface')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
