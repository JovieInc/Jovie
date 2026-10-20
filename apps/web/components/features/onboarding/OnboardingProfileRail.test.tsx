import { render, screen } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import {
  advanceOnboardingProfileDraft,
  emptyOnboardingProfileDraft,
  onboardingRoleSchema,
} from '@/lib/onboarding/profile-draft';
import {
  type OnboardingProfileBuilderState,
  OnboardingProfileRail,
  resolvePreviewArtist,
} from './OnboardingProfileRail';
import { deriveProfileBuilderState } from './onboardingChatHelpers';

vi.mock('@/features/profile/templates/ProfileCompactSurface', () => ({
  ProfileCompactSurface: ({ dataTestId }: { dataTestId?: string }) => (
    <div data-testid={dataTestId ?? 'profile-compact-surface'} />
  ),
}));

const CONFIRMED_STATE: OnboardingProfileBuilderState = {
  artist: {
    id: 'artist-1',
    name: 'Test Artist',
    url: 'https://open.spotify.com/artist/artist-1',
    imageUrl: 'https://i.scdn.co/image/test',
    followers: 12_300,
    genres: ['progressive house'],
    dspMatches: [
      {
        id: 'apple-music',
        label: 'Apple Music',
        platform: 'apple_music',
        url: 'https://music.apple.com/artist/test-artist',
      },
    ],
  },
  artistConfirmed: true,
  handle: 'testartist',
  socialLinks: [],
};

describe('OnboardingProfileRail', () => {
  it.each(
    onboardingRoleSchema.options.flatMap(role =>
      ['tool', 'metadata'].map(transport => ({ role, transport }))
    )
  )(
    'restores the $role draft from server $transport output',
    ({ role, transport }) => {
      const profileDraft = advanceOnboardingProfileDraft(
        emptyOnboardingProfileDraft(),
        {
          id: role,
          text: `I am a ${role} https://work.example I want a useful profile`,
        }
      );
      const output = { action: 'profile_draft_recorded', profileDraft };
      const message: UIMessage = {
        id: 'draft',
        role: 'assistant',
        parts:
          transport === 'tool'
            ? [
                {
                  type: 'dynamic-tool',
                  toolName: 'recordInterviewSignal',
                  toolCallId: 'draft',
                  state: 'output-available',
                  input: {},
                  output,
                },
              ]
            : [],
        metadata: transport === 'metadata' ? output : undefined,
      };
      expect(
        deriveProfileBuilderState({
          messages: [message],
          handleDraft: null,
          selectedArtist: null,
        }).profileDraft
      ).toEqual(profileDraft);
    }
  );
  it('shows the chosen non-music source and goal even with an earlier artist selection', () => {
    const profileDraft = advanceOnboardingProfileDraft(
      emptyOnboardingProfileDraft(),
      {
        id: 'founder',
        text: 'I am a founder https://company.example I want buyer contact',
      }
    );
    const state = { ...CONFIRMED_STATE, profileDraft };
    expect(resolvePreviewArtist(state)).toMatchObject({
      name: 'company.example',
      url: '',
      tagline: 'buyer contact',
    });
    render(<OnboardingProfileRail placement='inline' state={state} />);
    expect(
      screen.getByTestId('onboarding-profile-rail-inline')
    ).toHaveAttribute('data-onboarding-stage', 'review');
    expect(
      screen.queryByTestId('onboarding-dsp-match-strip')
    ).not.toBeInTheDocument();
    expect(screen.getByText('Draft · founder · Review')).toBeInTheDocument();
    expect(screen.queryByText('Test Artist')).not.toBeInTheDocument();
  });
  it('renders nothing when there is no preview artist', () => {
    const { container } = render(
      <OnboardingProfileRail
        state={{
          artist: null,
          artistConfirmed: false,
          handle: null,
          socialLinks: [],
        }}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps the DSP match strip outside the phone preview', () => {
    render(<OnboardingProfileRail placement='side' state={CONFIRMED_STATE} />);

    const rail = screen.getByTestId('onboarding-profile-rail');
    const phonePreview = screen.getByTestId('onboarding-phone-preview');
    const strip = screen.getByTestId('onboarding-dsp-match-strip');

    // Geometry (clear of Listen now at 1280x720 and 390x844) is asserted by
    // tests/e2e/storybook-onboarding-dsp-strip-clearance.spec.ts.
    expect(rail).toContainElement(strip);
    expect(phonePreview).not.toContainElement(strip);
  });

  it('renders the inline rail variant at mobile widths', () => {
    render(
      <OnboardingProfileRail placement='inline' state={CONFIRMED_STATE} />
    );

    expect(
      screen.getByTestId('onboarding-profile-rail-inline')
    ).toBeInTheDocument();
  });
});

describe('resolvePreviewArtist', () => {
  it('previews a handle-only profile once social links exist', () => {
    expect(
      resolvePreviewArtist({
        artist: null,
        artistConfirmed: false,
        handle: 'djnova',
        socialLinks: ['https://instagram.com/djnova'],
      })
    ).toEqual({ id: 'handle-djnova', name: 'djnova', url: '' });
  });
});
