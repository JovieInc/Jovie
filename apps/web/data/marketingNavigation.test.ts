import { describe, expect, it } from 'vitest';
import {
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

  it('keeps the tools flyout and commercial links stable until the generic creator flag is on', () => {
    expect(getMarketingToolsFlyoutLinks(false)).toBe(
      MARKETING_TOOLS_FLYOUT_LINKS
    );
    expect(getPublicCommercialFooterLinks(false)).toBe(
      PUBLIC_COMMERCIAL_FOOTER_LINKS
    );

    expect(MARKETING_TOOLS_FLYOUT_LINKS[0]).toMatchObject({
      label: 'Music Smart Links',
      description: 'One release link with a remembered streaming choice.',
    });
  });

  it('uses audience wording in flyout and commercial links when generic creator nav is on', () => {
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
          link.label === 'Audience capture' ||
          link.label === 'Audience reactivation'
      )
    ).toBe(false);
  });

  it('keeps internal, developer and dead-end items out of the footer', () => {
    const hrefs = MARKETING_FOOTER_COLUMNS.flatMap(column =>
      column.links.map(link => link.href)
    );

    for (const href of ['/engineering', '/ai', '/cli', '/card', '/compare']) {
      expect(hrefs).not.toContain(href);
    }
  });
});
