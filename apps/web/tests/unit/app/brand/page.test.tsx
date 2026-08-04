import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import BrandPage from '@/app/brand/page';
import release from '@/design/system-release.json';
import {
  PUBLIC_BRAND_ASSETS,
  PUBLIC_BRAND_MANIFEST,
  PUBLIC_BRAND_SECTION_IDS,
} from '@/lib/brand/public-system';

describe('app/brand/page', () => {
  it('renders an outcome-led hero and canonical CTA pair', () => {
    render(<BrandPage />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Build Jovie From The Source.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Download Brand System/ })
    ).toHaveAttribute('href', '#downloads');
    expect(
      screen.getByRole('link', { name: 'How the system works' })
    ).toHaveAttribute('href', '#system');
  });

  it('renders every required public section in canonical order', () => {
    const { container } = render(<BrandPage />);
    const sectionIds = Array.from(
      container.querySelectorAll('section[id]')
    ).map(section => section.id);

    expect(sectionIds).toEqual(PUBLIC_BRAND_SECTION_IDS);
  });

  it('renders the current version, manifest, and registered downloads', () => {
    const { container } = render(<BrandPage />);

    expect(screen.getAllByText(`v${release.version}`).length).toBeGreaterThan(
      0
    );
    expect(screen.getByRole('link', { name: /JSON manifest/ })).toHaveAttribute(
      'href',
      PUBLIC_BRAND_MANIFEST.href
    );

    const downloads = Array.from(
      container.querySelectorAll('section#downloads a[download]')
    );
    expect(downloads).toHaveLength(PUBLIC_BRAND_ASSETS.length + 1);
    for (const link of downloads) {
      const href = link.getAttribute('href') ?? '';
      expect(href.startsWith('/brand/')).toBe(true);
      expect(href.startsWith('/api/')).toBe(false);
      expect(href.startsWith('blob:')).toBe(false);
    }
  });

  it('publishes zero delight and no private media detail', () => {
    const { container } = render(<BrandPage />);
    const pageText = container.textContent ?? '';

    expect(pageText).toContain('Zero dominant delight is always valid');
    expect(pageText).toContain('Everything else used for selection');
    expect(pageText).not.toMatch(
      /campaign-option|demographic|targeting label/i
    );
  });

  it('renders the brand contact line', () => {
    render(<BrandPage />);
    const mailto = screen.getByRole('link', { name: 'brand@jov.ie' });
    expect(mailto).toHaveAttribute('href', 'mailto:brand@jov.ie');
    expect(mailto).toHaveClass('system-b-brand-contact-link');
  });

  it('emits minimal, release-stable JSON-LD', () => {
    const { container } = render(<BrandPage />);
    const ldScript = container.querySelector(
      'script[type="application/ld+json"]'
    );
    const structuredData = JSON.parse(ldScript?.textContent ?? '{}') as Record<
      string,
      unknown
    >;

    expect(structuredData['@type']).toBe('WebPage');
    expect(structuredData.name).toBe('Jovie Brand System');
    expect(structuredData.dateModified).toBe(release.releasedAt);
    expect(structuredData).not.toHaveProperty('keywords');
    expect(structuredData).not.toHaveProperty('audience');
    expect(structuredData).not.toHaveProperty('about');
  });
});
