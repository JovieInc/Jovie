import { describe, expect, it } from 'vitest';
import {
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

  it('links the engineering publication from the footer', () => {
    const hrefs = MARKETING_FOOTER_COLUMNS.flatMap(column =>
      column.links.map(link => link.href)
    );

    expect(hrefs).toContain('/engineering');
    expect(hrefs).not.toContain('/engineering/preview');
  });
});
