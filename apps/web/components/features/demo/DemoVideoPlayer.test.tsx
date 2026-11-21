import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DemoVideoPlayer } from './DemoVideoPlayer';

vi.mock('next/image', () => ({
  default: (props: { readonly alt: string; readonly className?: string }) => (
    <img alt={props.alt} className={props.className} />
  ),
}));

vi.mock('./ProductDemoCarousel', () => ({
  ProductDemoCarousel: () => <div data-testid='demo-carousel-fallback' />,
}));

describe('DemoVideoPlayer', () => {
  it('shows the play button on a media-fixed scrim and plays on click', async () => {
    const user = userEvent.setup();
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockResolvedValue(undefined);
    const { container } = render(
      <DemoVideoPlayer videoUrl='/demo.mp4' posterUrl='/poster.jpg' />
    );

    const button = screen.getByRole('button', {
      name: 'Play Jovie Demo Video',
    });
    expect(button.className).toContain('shadow-ink-on-media/40');
    expect(button.className).toContain('text-ink-on-media');
    expect(button.className).not.toContain('shadow-black');
    expect(screen.getByTestId('demo-video-visual').className).toContain(
      'bg-ink-on-media'
    );
    await expectNoA11yViolations(container);

    await user.click(button);

    expect(play).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByLabelText('Jovie demo video')
    ).toBeInTheDocument();
    play.mockRestore();
  });

  it('keeps the play button for a retry when playback is rejected', async () => {
    const user = userEvent.setup();
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockRejectedValue(new Error('blocked'));
    render(<DemoVideoPlayer videoUrl='/demo.mp4' posterUrl='/poster.jpg' />);

    await user.click(
      screen.getByRole('button', { name: 'Play Jovie Demo Video' })
    );

    expect(
      screen.getByRole('button', { name: 'Play Jovie Demo Video' })
    ).toBeInTheDocument();
    play.mockRestore();
  });

  it('falls back to the carousel without a video url', async () => {
    const { container } = render(<DemoVideoPlayer videoUrl={undefined} />);

    expect(screen.getByTestId('demo-carousel-fallback')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('falls back to the carousel when the video errors', async () => {
    const { container } = render(
      <DemoVideoPlayer videoUrl='/demo.mp4' controls />
    );

    const video = screen.getByLabelText('Jovie demo video');
    video.dispatchEvent(new Event('error'));

    expect(
      await screen.findByTestId('demo-carousel-fallback')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
