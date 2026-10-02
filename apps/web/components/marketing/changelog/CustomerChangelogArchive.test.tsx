import { readFileSync } from 'node:fs';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parseChangelog } from '@/lib/changelog-parser';
import {
  type CustomerChangelogMonthGroup,
  groupCustomerChangelogByMonth,
  projectCustomerChangelog,
} from '@/lib/customer-changelog';
import { resolveMonorepoPath } from '@/lib/filesystem-paths';
import { auditOrphans } from '@/lib/seo/geo-certification';
import { CustomerChangelogArchive } from './CustomerChangelogArchive';

const MONTHS: readonly CustomerChangelogMonthGroup[] = [
  {
    monthKey: '2026-08',
    label: 'August 2026',
    entries: [
      {
        title: 'Review qualified brand deals in your Inbox',
        slug: 'review-qualified-brand-deals-v26-8-1-0',
        date: '2026-08-16',
        summary: 'See the buyer, budget, and source.',
        category: 'new',
        capabilities: ['inbox'],
        surfaces: [],
        availability: 'ga',
        media: null,
        technicalVersion: '26.8.1',
        explanation: 'See the buyer, budget, and source.',
        supporting: [],
        technical: [],
        prominence: 'featured',
      },
    ],
  },
  {
    monthKey: '2026-07',
    label: 'July 2026',
    entries: [
      {
        title: 'Sign-out stays available when the store is missing',
        slug: 'sign-out-stays-available-v26-7-0-0',
        date: '2026-07-21',
        summary: 'Customer sessions can still leave.',
        category: 'fixed',
        capabilities: [],
        surfaces: [],
        availability: 'ga',
        media: null,
        technicalVersion: '26.7.0',
        explanation: 'Customer sessions can still leave.',
        supporting: [],
        technical: ['JOV-5260', 'Redis', 'admission'],
        prominence: 'small',
      },
    ],
  },
];

describe('CustomerChangelogArchive', () => {
  it('leads with outcome titles and keeps version tertiary', () => {
    render(<CustomerChangelogArchive months={MONTHS.slice(0, 1)} />);

    expect(
      screen.getByRole('heading', {
        name: 'Review qualified brand deals in your Inbox',
      })
    ).toBeVisible();
    expect(screen.getByText('August 16, 2026 · v26.8.1')).toBeVisible();
    expect(
      screen.getByText('August 16, 2026 · v26.8.1').closest('a')
    ).toHaveAttribute('href', '/changelog/26.8.1');
    expect(screen.queryByText(/^v26\.8\.1$/)).not.toBeInTheDocument();
    expect(
      screen.getByText('New', { selector: '.changelog-entry__category' })
    ).toBeVisible();
    expect(screen.getAllByText('Product update')).toHaveLength(2);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows one month then loads earlier updates without 1-of-N theater', () => {
    const { container } = render(<CustomerChangelogArchive months={MONTHS} />);

    // Month label appears twice by design: archive jump-nav rail + section heading.
    expect(screen.getAllByText('August 2026').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'August 2026' })).toHaveClass(
      'truncate'
    );
    expect(
      screen.queryByRole('heading', { name: 'July 2026' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Load Earlier Updates' })
    ).toBeVisible();
    expect(screen.queryByText(/Show \d+ More/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Showing \d+ of \d+/i)).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Load Earlier Updates' })
    );

    expect(screen.getAllByText('July 2026').length).toBeGreaterThan(0);
    expect(
      screen.queryByRole('button', { name: 'Load Earlier Updates' })
    ).not.toBeInTheDocument();
    expect(container.querySelector('img')).not.toBeInTheDocument();
  });

  it('links unloaded months to version pages and mounted months to existing anchors', () => {
    const { container } = render(<CustomerChangelogArchive months={MONTHS} />);
    const archive = within(
      screen.getByRole('navigation', { name: 'Changelog Archive' })
    );
    const latestEntry = archive.getByRole('link', {
      name: /Review qualified brand deals/,
    });
    const olderEntry = archive.getByRole('link', {
      name: /Sign-out stays available/,
    });
    const olderMonth = archive.getByRole('link', { name: 'July 2026' });

    expect(latestEntry).toHaveAttribute(
      'href',
      `#${MONTHS[0].entries[0].slug}`
    );
    expect(olderEntry).toHaveAttribute('href', '/changelog/26.7.0');
    expect(olderMonth).toHaveAttribute('href', '/changelog/26.7.0');
    expect(container.querySelector(`#${MONTHS[1].entries[0].slug}`)).toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: 'Load Earlier Updates' })
    );

    expect(olderEntry).toHaveAttribute('href', `#${MONTHS[1].entries[0].slug}`);
    expect(olderMonth).toHaveAttribute('href', '#changelog-month-2026-07');
    for (const link of archive.getAllByRole('link')) {
      const href = link.getAttribute('href');
      expect(href).toMatch(/^#/);
      expect(container.querySelector(href as string)).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole('button', { name: 'Fixed' }));
    expect(
      archive.queryByRole('link', { name: /Review qualified brand deals/ })
    ).toBeNull();
    expect(olderEntry).toHaveAttribute('href', `#${MONTHS[1].entries[0].slug}`);
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(
      archive.getByRole('link', { name: /Sign-out stays available/ })
    ).toHaveAttribute('href', '/changelog/26.7.0');
  });

  it('keeps published older releases crawlable in initial server-rendered HTML', () => {
    const markdown = readFileSync(resolveMonorepoPath('CHANGELOG.md'), 'utf8');
    const months = groupCustomerChangelogByMonth(
      projectCustomerChangelog(parseChangelog(markdown))
    );
    expect(months.length).toBeGreaterThan(1);
    const olderVersions = [
      ...new Set(
        months
          .slice(1)
          .flatMap(group => group.entries.map(entry => entry.technicalVersion))
      ),
    ];
    expect(olderVersions).toContain('26.8.1');
    const html = renderToStaticMarkup(
      <CustomerChangelogArchive months={months} />
    );
    const checks = auditOrphans(
      [
        { pathname: '/changelog', html, inSitemap: false },
        ...olderVersions.map(version => ({
          pathname: `/changelog/${version}`,
          html: '',
          inSitemap: true,
        })),
      ],
      'https://jov.ie'
    );

    for (const version of olderVersions) {
      expect(checks.get(`/changelog/${version}`)?.status).toBe('passed');
    }
    expect(html).not.toContain(`id="${months[1].entries[0].slug}"`);
  });

  it('keeps JOV-IDs, Redis, and admission on Level 3', () => {
    render(<CustomerChangelogArchive months={MONTHS.slice(1)} />);

    expect(
      screen.getByRole('heading', {
        name: 'Sign-out stays available when the store is missing',
      })
    ).toBeVisible();
    const disclosure = screen.getByText('Technical details').closest('details');
    expect(disclosure).not.toHaveAttribute('open');

    fireEvent.click(screen.getByText('Technical details'));

    expect(disclosure).toHaveAttribute('open');
    expect(screen.getByText(/JOV-5260/)).toBeVisible();
    expect(screen.getByText(/Redis/)).toBeVisible();
    expect(screen.getByText(/admission/)).toBeVisible();
  });

  it('renders the empty state without archive chrome', () => {
    render(<CustomerChangelogArchive months={[]} />);

    expect(screen.getByText('No updates yet. Check back soon!')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Load Earlier Updates' })
    ).not.toBeInTheDocument();
  });

  it('filters by category as a secondary control without hiding outcome titles', () => {
    render(<CustomerChangelogArchive months={MONTHS} />);

    const toolbar = screen.getByRole('toolbar', {
      name: 'Filter Updates By Category',
    });
    expect(toolbar).toBeVisible();

    const allChip = screen.getByRole('button', { name: 'All' });
    expect(allChip).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Fixed' }));

    expect(
      screen.getByRole('heading', {
        name: 'Sign-out stays available when the store is missing',
      })
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', {
        name: 'Review qualified brand deals in your Inbox',
      })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fixed' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Removed' }));
    expect(screen.getByText('No removed updates yet.')).toBeVisible();
  });

  it('offers every category filter even when the archive only has one', () => {
    render(<CustomerChangelogArchive months={MONTHS.slice(0, 1)} />);

    expect(
      screen.getByRole('toolbar', { name: 'Filter Updates By Category' })
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Removed' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });
});
