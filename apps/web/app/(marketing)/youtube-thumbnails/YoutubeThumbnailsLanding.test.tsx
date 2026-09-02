import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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
  it('leads with paste-channel as the one primary action, not signup', () => {
    render(<YoutubeThumbnailsLanding />);

    const primary = screen.getByTestId('youtube-thumbnails-primary-cta');
    expect(primary).toHaveAttribute('type', 'submit');
    expect(primary).toHaveAttribute('data-primary-action', 'true');
    expect(
      screen.getByTestId('youtube-thumbnails-channel-input')
    ).toHaveAttribute('placeholder', '@handle or youtube.com/@handle');
    expect(screen.getByTestId('youtube-thumbnails-paste-form')).toBeVisible();

    // Signup is not the first action anywhere above the fold.
    const hero = screen.getByTestId('marketing-section-hero');
    expect(hero.querySelectorAll('a[href*="/signup"]')).toHaveLength(0);
    expect(hero.querySelectorAll('[data-primary-action="true"]')).toHaveLength(
      1
    );
  });

  it('carries no standalone SKU or price', () => {
    render(<YoutubeThumbnailsLanding />);

    expect(screen.queryByText('$29')).toBeNull();
    expect(screen.queryByText('$0')).toBeNull();
    expect(screen.queryByText(/founder/i)).toBeNull();
    expect(screen.queryByTestId('marketing-section-pricing')).toBeNull();
    expect(screen.getByText('No separate plan.')).toBeVisible();
  });

  it('states three free, no faces, and connect-only-to-apply', () => {
    render(<YoutubeThumbnailsLanding />);

    expect(
      screen.getByText(
        'Three free per channel. Jovie never generates or alters faces.'
      )
    ).toBeVisible();
    expect(screen.getByText('Connect only to apply')).toBeVisible();
    expect(screen.getByText('Real people stay real')).toBeVisible();
    expect(YOUTUBE_THUMBNAILS_APPLY_HREF).toContain('intent=apply');
    expect(YOUTUBE_THUMBNAILS_APPLY_HREF).toContain(
      'source=youtube-thumbnails'
    );
  });

  it('ends with one Get started to /start and no signup detour', () => {
    render(<YoutubeThumbnailsLanding />);

    const cta = screen.getByTestId('youtube-thumbnails-get-started-cta');
    expect(cta).toHaveAttribute('href', YOUTUBE_THUMBNAILS_GET_STARTED_HREF);
    expect(YOUTUBE_THUMBNAILS_GET_STARTED_HREF).toMatch(/^\/start\?/);
  });

  it('reserves responsive section geometry and has no axe violations', async () => {
    const { container } = render(<YoutubeThumbnailsLanding />);

    expect(screen.getByTestId('marketing-section-how-it-works')).toHaveClass(
      'py-16',
      'sm:py-20'
    );
    expect(screen.getByTestId('marketing-section-cta')).toHaveClass(
      'py-16',
      'sm:py-20'
    );
    await expectNoA11yViolations(container);
  });
});
