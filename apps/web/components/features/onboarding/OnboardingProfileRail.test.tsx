import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  ProfileCompactSurface: ({
    dataTestId,
    releases = [],
  }: {
    dataTestId?: string;
    releases?: readonly { id: string; title: string }[];
  }) => (
    <div data-testid={dataTestId ?? 'profile-compact-surface'}>
      {releases.map(release => (
        <span key={release.id} data-testid='preview-release'>
          {release.title}
        </span>
      ))}
    </div>
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
  it('renders the confirmed artist real catalog on the preview (JOV-9758)', () => {
    const output = {
      action: 'spotify_artist_confirmed',
      spotifyArtistId: 'artist-1',
      artist: {
        id: 'artist-1',
        name: 'Test Artist',
        url: 'https://open.spotify.com/artist/artist-1',
      },
      catalog: {
        total: 22,
        releases: [
          {
            id: 'album-new',
            title: 'Newest single',
            releaseType: 'single',
            releaseDate: '2026-08-14',
            artworkUrl: 'https://i.scdn.co/image/new',
            spotifyUrl: 'https://open.spotify.com/album/albumnew',
          },
        ],
      },
    };
    const state = deriveProfileBuilderState({
      handleDraft: null,
      selectedArtist: null,
      messages: [
        {
          id: 'assistant-confirm',
          role: 'assistant',
          parts: [
            {
              type: 'dynamic-tool',
              toolName: 'confirmSpotifyArtist',
              toolCallId: 'confirm',
              state: 'output-available',
              input: {},
              output,
            },
          ],
        } as UIMessage,
      ],
    });
    render(<OnboardingProfileRail state={state} />);
    expect(screen.getByTestId('onboarding-profile-rail')).toHaveAttribute(
      'data-catalog-releases',
      '1'
    );
    expect(screen.getByTestId('preview-release')).toHaveTextContent(
      'Newest single'
    );
  });

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
    expect(screen.getByText('Preview · not claimed yet')).toBeInTheDocument();
    expect(screen.queryByText(/Draft · /)).toBeNull();
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
    expect(screen.getByText(/12\.3K Spotify followers/)).toBeVisible();
    // No pipeline words in the preview (2026-10-31 golden-path walk).
    expect(screen.queryByText(/enrichment|\(source:/i)).toBeNull();
  });

  it('renders the inline rail variant at mobile widths', () => {
    render(
      <OnboardingProfileRail placement='inline' state={CONFIRMED_STATE} />
    );

    expect(
      screen.getByTestId('onboarding-profile-rail-inline')
    ).toBeInTheDocument();
  });

  it('lets keyboard users enter the side preview scroll region', async () => {
    const user = userEvent.setup();
    render(<OnboardingProfileRail placement='side' state={CONFIRMED_STATE} />);

    await user.tab();

    expect(
      screen.getByRole('complementary', { name: 'Profile Preview' })
    ).toHaveFocus();
  });

  it('does not add a container tab stop to the inline preview', async () => {
    const user = userEvent.setup();
    render(
      <>
        <OnboardingProfileRail placement='inline' state={CONFIRMED_STATE} />
        <button type='button'>Continue conversation</button>
      </>
    );

    await user.tab();

    expect(
      screen.getByRole('button', { name: 'Continue conversation' })
    ).toHaveFocus();
  });
});

describe('resolvePreviewArtist', () => {
  it('previews a claimed handle before any link is shared (Pen R6As7U)', () => {
    expect(
      resolvePreviewArtist({
        artist: null,
        artistConfirmed: false,
        handle: 'timwhite',
        socialLinks: [],
      })
    ).toEqual({ id: 'handle-timwhite', name: 'timwhite', url: '' });
    expect(
      resolvePreviewArtist({
        artist: null,
        artistConfirmed: false,
        handle: null,
        socialLinks: [],
      })
    ).toBeNull();
  });

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

// JOV-7973: the side rail is a focusable scroll region, so it must own its
// Home/End keyboard scrolling (JOV-8844 reachability) instead of relying on
// the browser default, which the live chat's focus/keyboard layers can shadow
// mid-journey — leaving the rail at its bottom edge with the preview badge
// clipped at the scrollport top (golden-path toBeInViewport ratio 0.8125).
describe('OnboardingProfileRail keyboard scrolling (JOV-7973)', () => {
  it('scrolls itself to the top edge on Home', async () => {
    const user = userEvent.setup();
    render(<OnboardingProfileRail placement='side' state={CONFIRMED_STATE} />);
    const rail = screen.getByTestId('onboarding-profile-rail');
    const scrollTo = vi.fn();
    Object.defineProperty(rail, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    });

    await user.type(rail, '{Home}');
    expect(scrollTo).toHaveBeenLastCalledWith({
      top: 0,
      behavior: 'auto',
    });
  });

  it('scrolls itself to the bottom edge on End', async () => {
    const user = userEvent.setup();
    render(<OnboardingProfileRail placement='side' state={CONFIRMED_STATE} />);
    const rail = screen.getByTestId('onboarding-profile-rail');
    const scrollTo = vi.fn();
    Object.defineProperty(rail, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    });
    Object.defineProperty(rail, 'scrollHeight', {
      configurable: true,
      value: 754,
    });
    Object.defineProperty(rail, 'clientHeight', {
      configurable: true,
      value: 720,
    });

    await user.type(rail, '{End}');
    expect(scrollTo).toHaveBeenLastCalledWith({
      top: 34,
      behavior: 'auto',
    });
  });

  it('lets every other key scroll natively (no preventDefault)', async () => {
    const user = userEvent.setup();
    render(<OnboardingProfileRail placement='side' state={CONFIRMED_STATE} />);
    const rail = screen.getByTestId('onboarding-profile-rail');
    const scrollTo = vi.fn();
    Object.defineProperty(rail, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    });

    await user.type(rail, '{ArrowDown}');
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
