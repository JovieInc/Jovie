import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { YOUTUBE_THUMBNAILS_OPTIMIZATION } from '@/data/youtubeThumbnailsCopy';
import { evaluateDirectThumbnailMutation } from '@/lib/workflows/youtube-packaging/thumbnail-mutation-policy';
import {
  YOUTUBE_THUMBNAILS_APPLY_HREF,
  YOUTUBE_THUMBNAILS_GET_STARTED_HREF,
  YoutubeThumbnailsLanding,
} from './YoutubeThumbnailsLanding';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('YoutubeThumbnailsLanding (JOV-5862 lock)', () => {
  it('pastes a channel first, has no SKU, and Connects only to apply', () => {
    render(<YoutubeThumbnailsLanding />);
    const primary = screen.getByTestId('youtube-thumbnails-primary-cta');
    expect(primary).toHaveAttribute('type', 'submit');
    expect(primary).toHaveAttribute('data-primary-action', 'true');
    expect(screen.getByTestId('youtube-thumbnails-paste-form')).toBeVisible();
    const hero = screen.getByTestId('marketing-section-hero');
    expect(hero.querySelectorAll('a[href*="/signup"]')).toHaveLength(0);
    expect(screen.queryByText('$29')).toBeNull();
    expect(screen.queryByTestId('marketing-section-pricing')).toBeNull();
    expect(screen.getByText('No separate plan.')).toBeVisible();
    expect(screen.getByText('Connect only to apply')).toBeVisible();
    expect(YOUTUBE_THUMBNAILS_APPLY_HREF).toContain('intent=apply');
    expect(
      screen.getByTestId('youtube-thumbnails-get-started-cta')
    ).toHaveAttribute('href', YOUTUBE_THUMBNAILS_GET_STARTED_HREF);
    expect(YOUTUBE_THUMBNAILS_OPTIMIZATION.liveApplySurface).toBe(
      'youtube_packaging_experiment'
    );
    expect(evaluateDirectThumbnailMutation().allowed).toBe(false);
  });
});
