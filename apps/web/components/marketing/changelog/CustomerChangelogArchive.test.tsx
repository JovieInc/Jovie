import { readFileSync } from 'node:fs';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
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
        action: null,
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
        action: null,
        technical: ['JOV-5260', 'Redis', 'admission'],
        prominence: 'small',
      },
    ],
  },
];

function buildMonthFixture(
  monthCount: number
): readonly CustomerChangelogMonthGroup[] {
  return Array.from({ length: monthCount }, (_, index) => {
    const year = 2026 - Math.floor(index / 12);
    const month = 12 - (index % 12);
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;

    return {
      monthKey,
      label: `Fixture month ${index + 1}`,
      entries: [
        {
          title: `Fixture update ${index + 1}`,
          slug: `fixture-update-${index + 1}`,
          date: `${monthKey}-02`,
          summary: `Fixture outcome ${index + 1}.`,
          category: 'improved',
          capabilities: [],
          surfaces: [],
          availability: 'ga',
          action: null,
          media: null,
          technicalVersion: `${year}.${month}.0`,
          explanation: `Fixture outcome ${index + 1}.`,
          supporting: [],
          technical: [],
          prominence: index === 0 ? 'featured' : 'small',
        },
      ],
    };
  });
}

describe('CustomerChangelogArchive', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', window.location.pathname);
    document.activeElement instanceof HTMLElement &&
      document.activeElement.blur();
  });

  it('shows source-declared limited rollout prerequisites without a GA badge', () => {
    render(
      <CustomerChangelogArchive
        months={[
          {
            ...MONTHS[0],
            entries: [
              {
                ...MONTHS[0].entries[0],
                availability: 'limited',
                prerequisites: ['Eligible profiles with updates enabled'],
              },
            ],
          },
        ]}
      />
    );
    expect(screen.getByText('Limited availability')).toBeVisible();
    expect(
      screen.getByText('Eligible profiles with updates enabled')
    ).toBeVisible();
    expect(screen.queryByText('Generally available')).not.toBeInTheDocument();
  });

  it('renders a receipt-approved next step and never mints an unsafe link', () => {
    const action = {
      label: 'See it on a demo profile',
      href: '/demo/showcase/tim-white-profile?mode=subscribe',
    };
    render(
      <CustomerChangelogArchive
        months={[
          {
            ...MONTHS[0],
            entries: [{ ...MONTHS[0].entries[0], action }],
          },
          {
            ...MONTHS[1],
            entries: [
              {
                ...MONTHS[1].entries[0],
                action: { label: 'Unsafe', href: 'javascript:alert(1)' },
              },
            ],
          },
        ]}
      />
    );
    expect(
      screen.getByRole('link', { name: /See it on a demo profile/ })
    ).toHaveAttribute(
      'href',
      '/demo/showcase/tim-white-profile?mode=subscribe'
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Load Earlier Updates' })
    );
    expect(
      screen.queryByRole('link', { name: /Unsafe/ })
    ).not.toBeInTheDocument();
  });

  it('retains permanent engineering links when there are no approved customer outcomes', () => {
    render(
      <CustomerChangelogArchive
        months={[]}
        technicalReleases={[{ version: '26.6.50', date: '2026-06-15' }]}
      />
    );
    expect(screen.getByRole('link', { name: /26.6.50/ })).toHaveAttribute(
      'href',
      '/changelog/26.6.50'
    );
    expect(screen.getByText('Engineering history')).not.toBeVisible();
  });
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
    // One announcement, told once: a single heading and no decorative
    // placeholder card repeating the entry inside itself. The archive jump
    // nav link is the only other legitimate title surface.
    expect(
      screen.getAllByRole('heading', {
        name: 'Review qualified brand deals in your Inbox',
      })
    ).toHaveLength(1);
    expect(screen.queryByText('Product update')).not.toBeInTheDocument();
    expect(document.querySelector('.changelog-entry__card')).toBeNull();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders one real media asset per entry through the projected contract', () => {
    render(
      <CustomerChangelogArchive
        months={[
          {
            ...MONTHS[0],
            entries: [
              {
                ...MONTHS[0].entries[0],
                media: {
                  kind: 'image',
                  src: '/images/auth/noir-studio.webp',
                  alt: 'Inbox showing a qualified brand deal',
                },
              },
            ],
          },
        ]}
      />
    );

    const img = screen.getByRole('img', {
      name: 'Inbox showing a qualified brand deal',
    });
    expect(img.getAttribute('src')).toContain('/images/auth/noir-studio.webp');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('decoding', 'async');
    // Exactly one media region: the reserved-aspect frame, no second card.
    expect(document.querySelectorAll('.changelog-entry-media')).toHaveLength(1);
    expect(document.querySelector('.changelog-entry__card')).toBeNull();
  });

  it('removes the media region instead of leaving a placeholder gap when the asset fails', () => {
    render(
      <CustomerChangelogArchive
        months={[
          {
            ...MONTHS[0],
            entries: [
              {
                ...MONTHS[0].entries[0],
                media: {
                  kind: 'image',
                  src: '/images/auth/missing-asset.webp',
                  alt: 'Unavailable screenshot',
                },
              },
            ],
          },
        ]}
      />
    );

    const img = screen.getByRole('img', { name: 'Unavailable screenshot' });
    fireEvent.error(img);
    expect(
      screen.queryByRole('img', { name: 'Unavailable screenshot' })
    ).not.toBeInTheDocument();
    expect(document.querySelector('.changelog-entry-media')).toBeNull();
    expect(
      screen.getByRole('heading', {
        name: 'Review qualified brand deals in your Inbox',
      })
    ).toBeVisible();
  });

  it('renders contracted video with controls and no autoplay', () => {
    render(
      <CustomerChangelogArchive
        months={[
          {
            ...MONTHS[0],
            entries: [
              {
                ...MONTHS[0].entries[0],
                media: {
                  kind: 'video',
                  src: '/videos/inbox-tour.mp4',
                  alt: 'Inbox walkthrough',
                },
              },
            ],
          },
        ]}
      />
    );

    const video = document.querySelector(
      '.changelog-entry-media video'
    ) as HTMLVideoElement;
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute('controls');
    expect(video).toHaveAttribute('playsinline');
    expect(video).toHaveAttribute('preload', 'metadata');
    expect(video.autoplay).toBe(false);
    expect(video).toHaveAttribute('aria-label', 'Inbox walkthrough');
  });

  it('keeps long titles readable in a single text-first column', () => {
    const longTitle =
      'Review qualified brand deals in your Inbox with buyer context, budget signals, and source attribution across every connected profile';
    render(
      <CustomerChangelogArchive
        months={[
          {
            ...MONTHS[0],
            entries: [{ ...MONTHS[0].entries[0], title: longTitle }],
          },
        ]}
      />
    );

    expect(screen.getByRole('heading', { name: longTitle })).toBeVisible();
    expect(screen.getAllByRole('heading', { name: longTitle })).toHaveLength(1);
    expect(document.querySelector('.changelog-entry__card')).toBeNull();
    expect(document.querySelector('.changelog-entry-media')).toBeNull();
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

  it('keeps archive links on stable fragments before and after a month loads', () => {
    const { container } = render(<CustomerChangelogArchive months={MONTHS} />);
    fireEvent.click(screen.getByText('Browse all updates'));
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
    // The href is the same whether or not its month has mounted, so the
    // resolver can reveal the target instead of landing on the release page.
    expect(olderEntry).toHaveAttribute('href', `#${MONTHS[1].entries[0].slug}`);
    expect(olderMonth).toHaveAttribute('href', '#changelog-month-2026-07');
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
    ).toHaveAttribute('href', `#${MONTHS[1].entries[0].slug}`);
  });

  it('reveals, scrolls to, and focuses a deep-linked entry in an unloaded month', () => {
    window.location.hash = `#${MONTHS[1].entries[0].slug}`;
    const { container } = render(<CustomerChangelogArchive months={MONTHS} />);

    const target = container.querySelector(
      `#${MONTHS[1].entries[0].slug}`
    ) as HTMLElement;
    expect(target).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'July 2026' })
    ).toBeInTheDocument();
    expect(target).toHaveFocus();
    expect(
      screen.queryByRole('button', { name: 'Load Earlier Updates' })
    ).not.toBeInTheDocument();
  });

  it('reveals an unloaded month section for a month fragment', () => {
    window.location.hash = '#changelog-month-2026-07';
    const { container } = render(<CustomerChangelogArchive months={MONTHS} />);

    const section = container.querySelector(
      '#changelog-month-2026-07'
    ) as HTMLElement;
    expect(section).toBeInTheDocument();
    expect(section).toHaveFocus();
  });

  it('reveals the target when a hashchange arrives after mount', () => {
    const { container } = render(<CustomerChangelogArchive months={MONTHS} />);
    expect(container.querySelector(`#${MONTHS[1].entries[0].slug}`)).toBeNull();

    window.location.hash = `#${MONTHS[1].entries[0].slug}`;
    fireEvent(window, new HashChangeEvent('hashchange'));

    const target = container.querySelector(
      `#${MONTHS[1].entries[0].slug}`
    ) as HTMLElement;
    expect(target).toBeInTheDocument();
    expect(target).toHaveFocus();
  });

  it('resets an excluding category filter so the deep-linked entry is visible', () => {
    render(<CustomerChangelogArchive months={MONTHS} />);
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    expect(
      screen.queryByRole('heading', { name: /Sign-out stays available/ })
    ).not.toBeInTheDocument();

    window.location.hash = `#${MONTHS[1].entries[0].slug}`;
    fireEvent(window, new HashChangeEvent('hashchange'));

    const target = screen.getByRole('heading', {
      name: /Sign-out stays available/,
    });
    expect(target).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(document.getElementById(MONTHS[1].entries[0].slug)).toHaveFocus();
  });

  it('ignores unknown fragments without landing on a different entry', () => {
    window.location.hash = '#no-such-update';
    const { container } = render(<CustomerChangelogArchive months={MONTHS} />);

    expect(
      screen.getByRole('heading', {
        name: 'Review qualified brand deals in your Inbox',
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'July 2026' })
    ).not.toBeInTheDocument();
    expect(document.activeElement).not.toBe(
      container.querySelector(`#${MONTHS[0].entries[0].slug}`)
    );
  });

  it('keeps published older releases crawlable in initial server-rendered HTML', () => {
    const markdown = readFileSync(resolveMonorepoPath('CHANGELOG.md'), 'utf8');
    const releases = parseChangelog(markdown);
    const months = groupCustomerChangelogByMonth(
      projectCustomerChangelog(releases)
    );
    expect(months).toHaveLength(1); // Historical engineering records stay in the technical log.
    const olderVersions = releases
      .filter(release => release.version !== '2026-10-02')
      .map(release => release.version);
    expect(olderVersions).toContain('26.8.1');
    const html = renderToStaticMarkup(
      <CustomerChangelogArchive months={months} technicalReleases={releases} />
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
    expect(html).not.toContain('PersistentAudioBar tests');
    expect(html).toContain('Engineering history');
  });

  it('keeps current outcomes visible while the full crawlable archive stays in a native disclosure', () => {
    render(<CustomerChangelogArchive months={MONTHS} />);
    const disclosure = screen
      .getByText('Browse all updates')
      .closest('details');
    expect(disclosure).not.toHaveAttribute('open');
    expect(
      screen.getByRole('heading', { name: MONTHS[0].entries[0].title })
    ).toBeVisible();
    expect(
      screen.getByRole('navigation', { name: 'Changelog Archive' })
    ).not.toBeVisible();
    fireEvent.click(screen.getByText('Browse all updates'));
    expect(disclosure).toHaveAttribute('open');
    expect(
      screen.getByRole('navigation', { name: 'Changelog Archive' })
    ).toBeVisible();
  });

  it.each([1, 12, 36])(
    'keeps pre-content controls bounded with %i months of history',
    monthCount => {
      const months = buildMonthFixture(monthCount);
      const { container } = render(
        <CustomerChangelogArchive months={months} />
      );
      const outcomeList = container.querySelector('#changelog-outcome-list');
      const archive = screen.getByRole('navigation', {
        name: 'Changelog Archive',
        hidden: true,
      });

      expect(outcomeList).not.toBeNull();
      if (!outcomeList) {
        throw new Error('Expected the current changelog outcome list');
      }
      expect(outcomeList.compareDocumentPosition(archive)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING
      );
      expect(
        Array.from(
          container.querySelectorAll<HTMLElement>('button, a, summary')
        )
          .filter(
            control =>
              control.compareDocumentPosition(outcomeList) ===
              Node.DOCUMENT_POSITION_FOLLOWING
          )
          .map(control => control.textContent?.trim())
      ).toEqual(['All', 'New', 'Improved', 'Fixed', 'Removed']);
      expect(
        screen.getByRole('heading', { name: months[0].entries[0].title })
      ).toBeVisible();
    }
  );

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
