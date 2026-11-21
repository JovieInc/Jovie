import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DemoVideoPlayer } from './DemoVideoPlayer';

vi.mock('./ProductDemoCarousel', () => ({
  ProductDemoCarousel: () => <p>Carousel fallback</p>,
}));

describe('DemoVideoPlayer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts playback from the play button and then hides it', async () => {
    const user = userEvent.setup();
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockResolvedValue(undefined);
    const { container } = render(
      <DemoVideoPlayer videoUrl='/demo/video.mp4' />
    );

    const button = screen.getByRole('button', {
      name: 'Play Jovie Demo Video',
    });
    expect(button.className).toContain('bg-on-media');
    expect(button.className).not.toContain('bg-white');
    await expectNoA11yViolations(container);

    await user.click(button);

    expect(play).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('demo-video-visual')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Play Jovie Demo Video' })
    ).not.toBeInTheDocument();
  });

  it('keeps the play button available when playback is rejected', async () => {
    const user = userEvent.setup();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(
      new Error('blocked')
    );
    render(<DemoVideoPlayer videoUrl='/demo/video.mp4' />);

    await user.click(
      screen.getByRole('button', { name: 'Play Jovie Demo Video' })
    );

    expect(
      screen.getByRole('button', { name: 'Play Jovie Demo Video' })
    ).toBeInTheDocument();
  });

  it('falls back to the carousel without a video url', async () => {
    const { container } = render(<DemoVideoPlayer videoUrl={undefined} />);

    expect(screen.getByText('Carousel fallback')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
