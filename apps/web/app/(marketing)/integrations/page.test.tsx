import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MARKETING_FOOTER_COLUMNS } from '@/data/marketingNavigation';
import { getConnectorDefinitions } from '@/lib/connectors/registry';
import { auditGeo, auditOrphans } from '@/lib/seo/geo-certification';
import { certifyPage, extractSeoHead } from '@/lib/seo/page-certification';
import { siblingPathMatcher } from '@/lib/seo/seo-certify-sweep';

const { configuration } = vi.hoisted(() => ({ configuration: vi.fn() }));
const providerIds = getConnectorDefinitions().map(({ id }) => id);
const availability = (youtube: boolean) =>
  Object.fromEntries(
    providerIds.map(id => [id, { available: youtube && id === 'youtube' }])
  );
vi.mock('@/lib/connectors/availability.server', () => ({
  getConnectorAvailability: configuration,
}));

import IntegrationsDirectoryPage, { metadata } from './page';

const getHeading = (name: string) => screen.getByRole('heading', { name });
const present = (pattern: RegExp) =>
  expect(screen.getByText(pattern)).toBeInTheDocument();
const absent = (pattern: RegExp) =>
  expect(screen.queryByText(pattern)).not.toBeInTheDocument();
describe('public integrations projection', () => {
  beforeEach(() => configuration.mockReturnValue(availability(true)));
  it('renders implemented available operations rather than provider promises', () => {
    render(<IntegrationsDirectoryPage />);
    expect(getHeading('YouTube')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Spotify' })
    ).not.toBeInTheDocument();
    absent(/comment replies|Post approved replies/i);
    present(/Apply approved thumbnails.*Requires approval/);
    absent(/Instagram|Search Console|all comments/);
    expect(
      screen.getByRole('link', { name: 'Manage integrations' })
    ).toHaveAttribute('href', '/app/settings/connectors');
  });
  it('explains unavailable connection setup without offering placeholder connections', () => {
    configuration.mockReturnValue(availability(false));
    render(<IntegrationsDirectoryPage />);
    present(/Account connections are currently unavailable/);
    expect(
      screen.queryByRole('heading', { name: 'YouTube' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Related Pages' })
    ).toBeInTheDocument();
  });

  it('publishes canonical, structured data, body copy, and sibling links when no provider is configured', () => {
    configuration.mockReturnValue(availability(false));
    const { container } = render(<IntegrationsDirectoryPage />);
    const canonical = metadata.alternates?.canonical;
    expect(typeof canonical).toBe('string');
    const pageUrl = String(canonical);
    const description = String(metadata.description);
    expect(description.length).toBeGreaterThanOrEqual(50);
    expect(description.length).toBeLessThanOrEqual(170);
    const siteOrigin = new URL(pageUrl).origin;
    const html = `<!doctype html><html lang="en"><head>
      <title>Integrations | Jovie</title>
      <meta name="description" content="${description}">
      <link rel="canonical" href="${pageUrl}">
      <meta property="og:title" content="Integrations | Jovie">
      <meta property="og:description" content="${description}">
      <meta property="og:image" content="${siteOrigin}/og.png">
      <meta name="twitter:card" content="summary_large_image">
    </head><body>${container.innerHTML}</body></html>`;
    const head = extractSeoHead(html);
    const technical = certifyPage(
      { url: pageUrl, status: 200, html },
      { siteOrigin, inSitemap: true }
    );
    const geo = auditGeo(html, head, {
      pathname: '/integrations',
      family: 'other',
      siteOrigin,
      isSiblingPath: siblingPathMatcher(),
    });
    const orphans = auditOrphans(
      [
        { pathname: '/integrations', html, inSitemap: true },
        {
          pathname: '/',
          html: `<a href="${pageUrl}">Integrations</a>`,
          inSitemap: true,
        },
      ],
      siteOrigin
    );
    const failed = [...technical.checks, ...geo, orphans.get('/integrations')]
      .filter(check => check?.status === 'failed')
      .map(check => `${check?.dimension}:${check?.id}`);
    expect(failed).toEqual([]);
    expect(
      MARKETING_FOOTER_COLUMNS.find(column => column.title === 'Resources')
        ?.links
    ).toContainEqual({ href: '/integrations', label: 'Integrations' });
  });
});
