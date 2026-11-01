import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

  it('reserves the builder geometry so the panel never pushes the hero copy', () => {
    render(<UtmLinksLanding />);

    // CI saw utm-links-panel grow 424px -> 775px at ~370ms and drag the
    // centered copy down (CLS 0.0686). Columns top-align on md+, so panel
    // height can never move the copy, and the builder reserves its final
    // block size before the client island paints.
    const hero = screen.getByTestId('marketing-section-hero');
    expect(hero).toHaveClass('md:items-start');

    const reserve = screen
      .getByTestId('utm-links-panel')
      .querySelector('.utm-links-builder');
    expect(reserve).not.toBeNull();
    expect(reserve).toContainElement(screen.getByTestId('utm-builder'));

    const css = readFileSync(
      resolve(import.meta.dirname, 'UtmLinksBuilder.css'),
      'utf8'
    );
    expect(css).toMatch(/\.utm-links-builder\s*\{[^}]*min-block-size:/);
    expect(css).toMatch(
      /@media[^{]*40rem[^{]*\{\s*\.utm-links-builder\s*\{[^}]*min-block-size:/
    );
  });
});
