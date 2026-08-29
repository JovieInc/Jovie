import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  FOUNDER_THUMBNAIL_SIGNUP_HREF,
  FREE_THUMBNAIL_SIGNUP_HREF,
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

describe('YoutubeThumbnailsLanding', () => {
  it('routes free and founder intent through distinct signup paths', () => {
    render(<YoutubeThumbnailsLanding />);

    expect(
      screen.getByTestId('youtube-thumbnails-primary-cta')
    ).toHaveAttribute('href', FREE_THUMBNAIL_SIGNUP_HREF);
    expect(screen.getByTestId('youtube-thumbnails-free-cta')).toHaveAttribute(
      'href',
      FREE_THUMBNAIL_SIGNUP_HREF
    );
    expect(
      screen.getByTestId('youtube-thumbnails-founder-cta')
    ).toHaveAttribute('href', FOUNDER_THUMBNAIL_SIGNUP_HREF);
    expect(FOUNDER_THUMBNAIL_SIGNUP_HREF).toContain('offer=founder');
  });

  it('states the approved pricing and backlink boundary', () => {
    render(<YoutubeThumbnailsLanding />);

    expect(screen.getByText('$0')).toBeVisible();
    expect(screen.getByText('$29')).toBeVisible();
    expect(
      screen.getByText('10 thumbnail candidates each month')
    ).toBeVisible();
    expect(
      screen.getByText('“Thumbnails Powered by Jovie” description link')
    ).toBeVisible();
    expect(
      screen.getByText('Up to 10 live experiment starts each month')
    ).toBeVisible();
  });

  it('makes identity, style approval, automation, and native experiments explicit', () => {
    render(<YoutubeThumbnailsLanding />);

    expect(screen.getByText('Real people stay real')).toBeVisible();
    expect(screen.getByText('Every style earns approval')).toBeVisible();
    expect(screen.getByText('Automation is explicit')).toBeVisible();
    expect(screen.getByText('YouTube stays in control')).toBeVisible();
    expect(
      screen.getByRole('img', {
        name: 'Thumbnail Approval Queue Preview With Three Candidates',
      })
    ).toBeVisible();
  });

  it('reserves responsive section geometry and has no axe violations', async () => {
    const { container } = render(<YoutubeThumbnailsLanding />);

    expect(screen.getByTestId('marketing-section-how-it-works')).toHaveClass(
      'py-16',
      'sm:py-20'
    );
    expect(screen.getByTestId('marketing-section-pricing')).toHaveClass(
      'py-16',
      'sm:py-20'
    );
    await expectNoA11yViolations(container);
  });
});
