import { describe, expect, it } from 'vitest';
import {
  MARKETING_FOOTER_COLUMNS,
  MARKETING_FOR_FLYOUT_LINKS,
  MARKETING_LEGAL_LINKS,
  MARKETING_NAV_LINKS,
  MARKETING_NAV_UTILITIES,
  MARKETING_TOOLS_FLYOUT_LINKS,
} from './marketingNavigation';

const PRIVATE_INVESTOR_HREF =
  /^\/(?:investors|pitch|investor-portal)(?:[/?#]|$)/u;

describe('public marketing navigation', () => {
  it('never links private investor surfaces', () => {
    const hrefs = [
      ...MARKETING_FOOTER_COLUMNS.flatMap(column => column.links),
      ...MARKETING_LEGAL_LINKS,
      ...MARKETING_NAV_LINKS,
      ...MARKETING_NAV_UTILITIES,
      ...MARKETING_FOR_FLYOUT_LINKS,
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
});
