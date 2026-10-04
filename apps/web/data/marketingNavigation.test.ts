import { describe, expect, it } from 'vitest';
import {
  getMarketingFooterColumns,
  getMarketingToolsFlyoutLinks,
  getPublicCommercialFooterLinks,
  MARKETING_CUSTOMERS_FLYOUT,
  MARKETING_FOOTER_COLUMNS,
  MARKETING_LEGAL_LINKS,
  MARKETING_NAV_LINKS,
  MARKETING_NAV_UTILITIES,
  MARKETING_TOOLS_FLYOUT_LINKS,
  PUBLIC_COMMERCIAL_FOOTER_LINKS,
} from './marketingNavigation';

const PRIVATE_INVESTOR_HREF =
  /^\/(?:investors|pitch|investor-portal)(?:[/?#]|$)/u;

describe('public marketing navigation', () => {
  it('never links private investor surfaces', () => {
    const hrefs = [
      ...MARKETING_FOOTER_COLUMNS.flatMap(column => column.links),
      ...PUBLIC_COMMERCIAL_FOOTER_LINKS,
      ...MARKETING_LEGAL_LINKS,
      ...MARKETING_NAV_LINKS,
      ...MARKETING_NAV_UTILITIES,
      ...MARKETING_CUSTOMERS_FLYOUT.links,
      ...MARKETING_TOOLS_FLYOUT_LINKS,
    ].map(link => link.href);

    expect(hrefs.length).toBeGreaterThan(10);
    expect(hrefs.filter(href => PRIVATE_INVESTOR_HREF.test(href))).toEqual([]);
  });

  it('drops the Investors and Pitch footer labels', () => {
    const labels = MARKETING_FOOTER_COLUMNS.flatMap(column =>
      column.links.map(link => link.label)
    );

    expect(labels).not.toContain('Investors');
    expect(labels).not.toContain('Pitch');
  });

  it('links the AI public brief from the Product footer', () => {
    const product = MARKETING_FOOTER_COLUMNS.find(
      column => column.title === 'Product'
    );

    expect(product?.links).toEqual([
      { href: '/product', label: 'Product' },
      { href: '/ai', label: 'AI Operating System' },
      { href: '/card', label: 'Jovie Card' },
      { href: '/pricing', label: 'Pricing' },
    ]);
  });

  it('keeps the Music footer and fan labels until the generic creator flag is on', () => {
    expect(getMarketingFooterColumns(false)).toBe(MARKETING_FOOTER_COLUMNS);
    expect(getMarketingToolsFlyoutLinks(false)).toBe(
      MARKETING_TOOLS_FLYOUT_LINKS
    );
    expect(getPublicCommercialFooterLinks(false)).toBe(
      PUBLIC_COMMERCIAL_FOOTER_LINKS
    );

    const music = MARKETING_FOOTER_COLUMNS.find(
      column => column.title === 'Music'
    );
    expect(music?.links.map(link => link.label)).toEqual([
      'Artist Profiles',
      'Music Smart Links',
      'Notifications',
      'Pay',
      'Fan Capture',
      'Fan Reactivation',
      'Product Demo',
      'Release System',
    ]);
    expect(MARKETING_TOOLS_FLYOUT_LINKS[0]).toMatchObject({
      label: 'Music Smart Links',
      description: 'One release link with a remembered streaming choice.',
    });
  });

  it('uses a Customers column and audience wording when generic creator nav is on', () => {
    const customers = getMarketingFooterColumns(true).find(
      column => column.title === 'Customers'
    );
    expect(
      getMarketingFooterColumns(true).some(column => column.title === 'Music')
    ).toBe(false);
    expect(customers?.links.map(link => link.label)).toEqual([
      'Artists',
      'Artist Profiles',
      'Smart Links',
      'Notifications',
      'Pay',
      'Audience Capture',
      'Audience Reactivation',
      'Product Demo',
      'Release System',
    ]);
    expect(customers?.links[0]).toMatchObject({
      href: '/solutions/artists',
      label: 'Artists',
    });
    expect(customers?.links[2]?.href).toBe('/smart-links');
    expect(
      customers?.links.find(link => link.label === 'Audience Capture')?.href
    ).toBe('/artist-profiles#capture-every-fan');
    expect(
      customers?.links.find(link => link.label === 'Audience Reactivation')
        ?.href
    ).toBe('/artist-profiles#bring-them-back-automatically');

    expect(getMarketingToolsFlyoutLinks(true)[0]).toMatchObject({
      href: '/smart-links',
      label: 'Smart Links',
      description: 'Share your work with one link. Example: a release.',
    });
    expect(
      getPublicCommercialFooterLinks(true).map(link => link.label)
    ).toContain('Smart Links');
    expect(
      getPublicCommercialFooterLinks(true).map(link => link.label)
    ).not.toContain('Music Smart Links');
    expect(
      getPublicCommercialFooterLinks(true).some(
        link =>
          link.label === 'Fan Capture' || link.label === 'Fan Reactivation'
      )
    ).toBe(false);
  });

  it('links the engineering publication from the footer', () => {
    const hrefs = MARKETING_FOOTER_COLUMNS.flatMap(column =>
      column.links.map(link => link.href)
    );

    expect(hrefs).toContain('/engineering');
    expect(hrefs).not.toContain('/engineering/preview');
  });
});
