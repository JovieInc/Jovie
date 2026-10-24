import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UTM_LINKS_COPY, UTM_LINKS_RESULT_URL } from '@/data/utmLinksCopy';
import { UtmLinksLanding } from './UtmLinksLanding';

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

describe('UtmLinksLanding', () => {
  it('renders the live UTM builder in the hero with fixture params', () => {
    render(<UtmLinksLanding />);

    const hero = screen.getByTestId('marketing-section-hero');
    expect(hero.tagName).toBe('SECTION');
    expect(hero).toHaveAttribute(
      'data-marketing-variant',
      'split-screenshot-right'
    );
    expect(hero).toHaveAttribute(
      'data-marketing-owner',
      'apps/web/app/(marketing)/product/utm-links/UtmLinksLanding.tsx'
    );
    expect(hero.closest('[data-accent="ion"]')).not.toBeNull();
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(UTM_LINKS_COPY.headline);
    expect(heading).toHaveAttribute('data-wrap', 'editorial-title');
    expect(heading).toHaveClass('product-feature-title');
    expect(heading).not.toHaveClass('line-clamp-2');
    expect(screen.getByText(UTM_LINKS_COPY.support)).toBeVisible();

    const builder = within(hero).getByTestId('utm-builder');
    expect(builder).toBeVisible();
    expect(within(builder).getByLabelText(/source/i)).toHaveValue('newsletter');
    expect(within(builder).getByText(UTM_LINKS_RESULT_URL)).toBeVisible();
    expect(
      within(builder).getByRole('button', { name: /copy link/i })
    ).toBeEnabled();
    expect(
      within(builder).queryByText(/add a source/i)
    ).not.toBeInTheDocument();

    const panel = screen.getByTestId('utm-links-panel');
    expect(panel).toHaveClass('marketing-rounded-frame', 'border');

    for (const link of UTM_LINKS_COPY.links) {
      expect(screen.getByRole('link', { name: link.label })).toHaveAttribute(
        'href',
        link.href
      );
    }
  });
});
