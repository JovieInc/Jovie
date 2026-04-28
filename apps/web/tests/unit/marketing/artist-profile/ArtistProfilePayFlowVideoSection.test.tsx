import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArtistProfilePayFlowVideoSection } from '@/components/marketing/artist-profile/ArtistProfilePayFlowVideoSection';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';

const reducedMotionMock = vi.hoisted(() => ({ value: false }));

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => reducedMotionMock.value,
}));

afterEach(() => {
  reducedMotionMock.value = false;
});

const VIDEO_URL = 'https://example.blob.vercel-storage.com/pay-flow.mp4';

describe('ArtistProfilePayFlowVideoSection', () => {
  it('renders the video when a URL is provided and reduced motion is off', () => {
    const { container } = render(
      <ArtistProfilePayFlowVideoSection
        copy={ARTIST_PROFILE_COPY.payFlowVideo}
        monetization={ARTIST_PROFILE_COPY.monetization}
        videoUrl={VIDEO_URL}
      />
    );

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: ARTIST_PROFILE_COPY.payFlowVideo.headline,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(ARTIST_PROFILE_COPY.payFlowVideo.subhead)
    ).toBeInTheDocument();

    const video = screen.getByLabelText(
      ARTIST_PROFILE_COPY.payFlowVideo.ariaLabel
    );
    expect(video).toBeInTheDocument();
    expect(video).toHaveAttribute('src', VIDEO_URL);
    expect(video).toHaveAttribute(
      'poster',
      '/product-screenshots/tim-white-profile-pay-phone.png'
    );
    expect(video).toHaveAttribute('loop');
    expect(video).toHaveAttribute('autoplay');
    expect(video).toHaveAttribute('playsinline');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('falls back to the monetization section when no video URL is provided', () => {
    render(
      <ArtistProfilePayFlowVideoSection
        copy={ARTIST_PROFILE_COPY.payFlowVideo}
        monetization={ARTIST_PROFILE_COPY.monetization}
        videoUrl={undefined}
      />
    );

    expect(
      screen.queryByRole('heading', {
        level: 2,
        name: ARTIST_PROFILE_COPY.payFlowVideo.headline,
      })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: ARTIST_PROFILE_COPY.monetization.headline,
      })
    ).toBeInTheDocument();
  });

  it('renders a tap-to-play button instead of autoplay when reduced motion is on', () => {
    reducedMotionMock.value = true;

    render(
      <ArtistProfilePayFlowVideoSection
        copy={ARTIST_PROFILE_COPY.payFlowVideo}
        monetization={ARTIST_PROFILE_COPY.monetization}
        videoUrl={VIDEO_URL}
      />
    );

    const video = screen.getByLabelText(
      ARTIST_PROFILE_COPY.payFlowVideo.ariaLabel
    );
    expect(video).not.toHaveAttribute('autoplay');

    const playButton = screen.getByRole('button', {
      name: new RegExp(ARTIST_PROFILE_COPY.payFlowVideo.playLabel, 'i'),
    });
    expect(playButton).toBeInTheDocument();

    const playSpy = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockResolvedValue(undefined);
    fireEvent.click(playButton);
    expect(playSpy).toHaveBeenCalled();
    playSpy.mockRestore();
  });

  it('falls back to the monetization section when the video errors out', () => {
    render(
      <ArtistProfilePayFlowVideoSection
        copy={ARTIST_PROFILE_COPY.payFlowVideo}
        monetization={ARTIST_PROFILE_COPY.monetization}
        videoUrl={VIDEO_URL}
      />
    );

    const video = screen.getByLabelText(
      ARTIST_PROFILE_COPY.payFlowVideo.ariaLabel
    );
    fireEvent.error(video);

    expect(
      screen.queryByLabelText(ARTIST_PROFILE_COPY.payFlowVideo.ariaLabel)
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: ARTIST_PROFILE_COPY.monetization.headline,
      })
    ).toBeInTheDocument();
  });
});
