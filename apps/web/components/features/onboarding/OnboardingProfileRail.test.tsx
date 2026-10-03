import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  type OnboardingProfileBuilderState,
  OnboardingProfileRail,
  resolvePreviewArtist,
} from './OnboardingProfileRail';

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

  it('keeps the DSP match strip in flow below the phone, never over the CTA', () => {
    render(<OnboardingProfileRail placement='side' state={CONFIRMED_STATE} />);

    const rail = screen.getByTestId('onboarding-profile-rail');
    const phonePreview = screen.getByTestId('onboarding-phone-preview');
    const strip = screen.getByTestId('onboarding-dsp-match-strip');

    expect(rail).toContainElement(strip);
    expect(phonePreview).not.toContainElement(strip);
    // Regression: the strip was absolutely positioned and could cover the
    // preview's Listen now CTA (JOV DSP-strip clearance fix).
    expect(strip.className).not.toContain('absolute');
    expect(
      phonePreview.compareDocumentPosition(strip) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
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
