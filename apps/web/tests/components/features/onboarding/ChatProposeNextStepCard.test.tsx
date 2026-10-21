import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatProposeNextStepCard } from '@/components/features/onboarding/ChatProposeNextStepCard';
import type { OnboardingProfileBuilderState } from '@/components/features/onboarding/OnboardingProfileRail';
import { OnboardingProfileReviewContext } from '@/components/features/onboarding/OnboardingProfileReviewContext';

const { authState, trackMock } = vi.hoisted(() => ({
  authState: { isSignedIn: false },
  trackMock: vi.fn(),
}));

vi.mock('@/hooks/useJovieAuth', () => ({
  useJovieAuth: () => ({ isSignedIn: authState.isSignedIn }),
  useCanRenderAuthUi: () => true,
}));

vi.mock('@/features/auth', () => ({
  AuthShell: ({
    fallbackRedirectUrl,
    suppressOneTap,
  }: {
    fallbackRedirectUrl: string;
    suppressOneTap: boolean;
  }) => (
    <div
      data-testid='waitlist-signup'
      data-return-to={fallbackRedirectUrl}
      data-one-tap-suppressed={suppressOneTap}
    >
      signup
    </div>
  ),
}));

vi.mock('@/features/profile/templates/ProfileCompactSurface', () => ({
  ProfileCompactSurface: () => <div data-testid='catalog-preview' />,
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
    expect(
      screen.getByText(/save this request and reserve your name and profile/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/you are not on the list/i)).toBeInTheDocument();
    expect(screen.getByText(/save your spot/i)).toBeInTheDocument();
    expect(screen.queryByText(/you're on the list/i)).not.toBeInTheDocument();
  });

  it('shows a non-terminal saving state after authentication', () => {
    authState.isSignedIn = true;
    render(<ChatProposeNextStepCard payload={waitlistPayload} />);

    expect(
      screen.getByText(
        /saving your request and reserving your name and profile/i
      )
    ).toBeInTheDocument();
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

const instantPayload = {
  ...waitlistPayload,
  decision: { ...waitlistPayload.decision, kind: 'instant_access' as const },
};
const preview: OnboardingProfileBuilderState = {
  artist: {
    id: 'fixture',
    name: 'Fixture Artist',
    url: 'https://open.spotify.com/artist/fixture',
    latestRelease: {
      title: 'Catalog release',
      slug: 'catalog-release',
      artworkUrl: 'https://cdn.example.com/release.webp',
      releaseDate: '2026-10-20',
      releaseType: 'single',
    },
  },
  artistConfirmed: true,
  handle: 'fixtureartist',
  socialLinks: ['https://instagram.com/fixtureartist'],
};

describe('profile review before authentication', () => {
  beforeEach(() => {
    authState.isSignedIn = false;
  });

  function reviewCard(state = preview, onEditDetails = vi.fn()) {
    return (
      <OnboardingProfileReviewContext.Provider value={{ state, onEditDetails }}>
        <ChatProposeNextStepCard payload={instantPayload} />
      </OnboardingProfileReviewContext.Provider>
    );
  }

  it('shows the real profile and catalog before mounting auth, then preserves handle through signup', async () => {
    render(reviewCard());
    expect(
      screen.getByRole('heading', { name: 'Here is jov.ie/fixtureartist' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Latest release: Catalog release')
    ).toBeInTheDocument();
    expect(screen.getByTestId('catalog-preview')).toBeInTheDocument();
    expect(screen.queryByTestId('waitlist-signup')).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: /keep this profile/i })
    );
    expect(screen.getByTestId('waitlist-signup')).toHaveAttribute(
      'data-return-to',
      '/start?handle=fixtureartist'
    );
    expect(screen.getByTestId('waitlist-signup')).toHaveAttribute(
      'data-one-tap-suppressed',
      'true'
    );
    expect(
      screen.getByText(/has not been saved to your account/)
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: /back to preview/i })
    );
    expect(screen.queryByTestId('waitlist-signup')).not.toBeInTheDocument();
  });

  it('requires a new keep action after the artist or handle changes', async () => {
    const { rerender } = render(reviewCard());
    await userEvent.click(
      screen.getByRole('button', { name: /keep this profile/i })
    );
    rerender(reviewCard({ ...preview, handle: 'different' }));
    expect(screen.queryByTestId('waitlist-signup')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /keep this profile/i })
    ).toBeEnabled();
  });

  it('edits the existing conversation and never invents a preview when source state is missing', async () => {
    const onEditDetails = vi.fn();
    const { rerender } = render(reviewCard(preview, onEditDetails));
    await userEvent.click(
      screen.getByRole('button', { name: /edit details/i })
    );
    expect(onEditDetails).toHaveBeenCalledOnce();
    rerender(
      reviewCard({ ...preview, artist: null, handle: null, socialLinks: [] })
    );
    expect(
      screen.getByRole('button', { name: /keep this profile/i })
    ).toBeDisabled();
    expect(screen.queryByTestId('waitlist-signup')).not.toBeInTheDocument();
  });
});
