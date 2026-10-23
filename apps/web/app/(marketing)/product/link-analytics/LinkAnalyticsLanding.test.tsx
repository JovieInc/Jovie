import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span data-alt={alt} data-src={src} />
  ),
}));

import { LINK_ANALYTICS_COPY } from '@/data/linkAnalyticsCopy';
import { LinkAnalyticsLanding } from './LinkAnalyticsLanding';

describe('LinkAnalyticsLanding', () => {
  it('renders the live analytics panel in the hero', () => {
    render(<LinkAnalyticsLanding />);

    const hero = screen.getByTestId('marketing-section-hero');
    expect(hero.tagName).toBe('SECTION');
    expect(hero).toHaveAttribute(
      'data-marketing-variant',
      'split-screenshot-right'
    );
    expect(hero).toHaveAttribute(
      'data-marketing-owner',
      'apps/web/app/(marketing)/product/link-analytics/LinkAnalyticsLanding.tsx'
    );
    expect(hero).toHaveAttribute('data-accent', 'ion');

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(LINK_ANALYTICS_COPY.headline);
    expect(heading).toHaveAttribute('data-wrap', 'editorial-title');
    expect(heading.className).not.toMatch(/line-clamp/);
    expect(screen.getByText(LINK_ANALYTICS_COPY.support)).toBeVisible();

    const analytics = screen.getByTestId('release-smart-link-analytics');
    expect(analytics).toBeVisible();
    const panel = screen.getByTestId('link-analytics-panel');
    expect(panel).toHaveClass(
      'rounded-3xl',
      'border',
      'border-subtle',
      'bg-surface-1'
    );
    expect(panel).toContainElement(analytics);
    expect(screen.getByText('Total Clicks')).toBeVisible();

    for (const link of LINK_ANALYTICS_COPY.links) {
      expect(screen.getByRole('link', { name: link.label })).toHaveAttribute(
        'href',
        link.href
      );
    }
  });
});
