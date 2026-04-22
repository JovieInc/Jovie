import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { YouTubeEmbed } from '@/features/release/YouTubeEmbed';

describe('YouTubeEmbed', () => {
  it('renders an iframe with the correct src', () => {
    render(<YouTubeEmbed videoId='dQw4w9WgXcQ' title='Test Video' />);

    const iframe = screen.getByTitle('Test Video');
    expect(iframe).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'
    );
  });

  it('sets an accessible title attribute', () => {
    render(
      <YouTubeEmbed videoId='abc123def45' title='Music video: Song by Artist' />
    );

    const iframe = screen.getByTitle('Music video: Song by Artist');
    expect(iframe).toBeInTheDocument();
  });

  it('renders loading skeleton initially', () => {
    const { container } = render(
      <YouTubeEmbed videoId='dQw4w9WgXcQ' title='Test' />
    );

    const skeleton = container.querySelector('.animate-pulse');
    expect(skeleton).toBeTruthy();
  });
});
