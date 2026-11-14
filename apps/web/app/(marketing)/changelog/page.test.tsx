import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangelogParseResult } from '@/lib/changelog-parser';
import { applyRootTitleTemplate } from '@/lib/seo/document-title';

const SNAPSHOT: ChangelogParseResult = {
  releases: [
    {
      version: '26.8.2',
      kind: 'release',
      date: '2026-08-31',
      summary: '',
      sections: {
        featured: [],
        added: ['Library filters: one catalog for every stage.'],
        changed: [],
        fixed: [],
        removed: [],
      },
    },
  ],
  sourceReleases: [
    {
      version: '26.9.0',
      kind: 'release',
      date: '2026-09-19',
      summary: '',
      sections: {
        featured: [],
        added: [],
        changed: [],
        fixed: [],
        removed: [],
      },
    },
  ],
  unpublishedReleases: [
    {
      version: '26.9.0',
      kind: 'release',
      date: '2026-09-19',
      summary: '',
      sections: {
        featured: [],
        added: [],
        changed: [],
        fixed: [],
        removed: [],
      },
    },
  ],
};

function reviewedSnapshot(
  snapshot: ChangelogParseResult
): ChangelogParseResult {
  const releases = snapshot.releases.map(release => ({
    ...release,
    customerOutcomes: Object.entries(release.sections).flatMap(
      ([section, entries]) =>
        entries.map((summary: string, index: number) => ({
          storyId: `${release.version}-${section}-${index}`,
          entryId: `customer-update:${release.version.replaceAll('.', '-')}-${section}-${index}`,
          slug: `update-${release.version.replaceAll('.', '-')}-${section}-${index}`,
          aliases: [],
          summary,
          section: section as keyof typeof release.sections,
          availability: 'unverified' as const,
          prerequisites: [],
        }))
    ),
  }));
  return {
    ...snapshot,
    releases,
    sourceReleases: [
      ...releases,
      ...snapshot.sourceReleases.filter(
        source => !releases.some(release => release.version === source.version)
      ),
    ],
  };
}
let currentSnapshot = reviewedSnapshot(SNAPSHOT);

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    readonly href: string;
    readonly children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/changelog-source', () => ({
  getChangelogSnapshot: async () => reviewedSnapshot(currentSnapshot),
}));

vi.mock('@/components/marketing/changelog/ChangelogSubscribeColumn', () => ({
  ChangelogSubscribeColumn: () => <div data-testid='changelog-subscribe' />,
}));

const footerCtaProps: object[] = [];
vi.mock('@/components/site/MarketingFooterCta', () => ({
  MarketingFooterCta: (props: object) => {
    footerCtaProps.push(props);
    return <div data-testid='marketing-footer-cta' />;
  },
}));

import ChangelogPage, { metadata } from './page';

describe('public changelog page', () => {
  beforeEach(() => {
    footerCtaProps.length = 0;
    currentSnapshot = reviewedSnapshot(SNAPSHOT);
  });
  it('does not describe older empty slots as newer than a published daily update', async () => {
    currentSnapshot = {
      ...SNAPSHOT,
      releases: [
        {
          ...SNAPSHOT.releases[0],
          version: '2026-10-02',
          kind: 'daily',
          date: '2026-10-02',
        },
      ],
    };
    render(await ChangelogPage());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'October 2026' })).toBeVisible();
  });
  it('renders the empty state without inventing a date or update', async () => {
    currentSnapshot = { ...SNAPSHOT, releases: [] };
    render(await ChangelogPage());
    expect(screen.getByText('No updates yet. Check back soon!')).toBeVisible();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('keeps one plain page heading and no pipeline vocabulary', async () => {
    const { container } = render(await ChangelogPage());

    expect(
      screen.getAllByRole('heading', { level: 1, name: 'Changelog' })
    ).toHaveLength(1);
    expect(
      screen.getByText('New features, improvements and fixes in Jovie.')
    ).toBeVisible();
    expect(screen.getByTestId('changelog-subscribe')).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/source-backed|release slots/i);
    expect(screen.queryByText('Product update')).not.toBeInTheDocument();
  });

  it('never promotes a bare area label to a headline', async () => {
    render(await ChangelogPage());

    expect(
      screen.getByRole('heading', {
        level: 3,
        name: 'Library filters: one catalog for every stage.',
      })
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Library filters' })
    ).not.toBeInTheDocument();
  });

  it('describes each rendered post to answer engines as structured data', async () => {
    const { container } = render(await ChangelogPage());

    const schema = JSON.parse(
      container.querySelector('script[type="application/ld+json"]')
        ?.textContent ?? '{}'
    );
    expect(schema['@type']).toBe('Blog');
    expect(schema.url).toMatch(/\/changelog$/);
    const headings = screen
      .getAllByRole('heading', { level: 3 })
      .map(heading => heading.textContent);
    expect(schema.blogPost.length).toBeGreaterThan(0);
    for (const post of schema.blogPost) {
      expect(post['@type']).toBe('BlogPosting');
      expect(headings).toContain(post.headline);
      expect(post.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(post.url).toMatch(/\/changelog#.+/);
    }
  });

  it('uses a descriptive product-update title for search and sharing', () => {
    expect(applyRootTitleTemplate(metadata.title)).toBe(
      'Changelog: product updates and new features | Jovie'
    );
  });

  it('renders exactly one footer CTA on the shared claim-profile intent', async () => {
    render(await ChangelogPage());

    expect(screen.getAllByTestId('marketing-footer-cta')).toHaveLength(1);
    expect(footerCtaProps).toEqual([{}]);
  });
});
