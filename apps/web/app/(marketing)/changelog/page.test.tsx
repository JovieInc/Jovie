import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangelogParseResult } from '@/lib/changelog-parser';

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

vi.mock('@/components/site/MarketingFooterCta', () => ({
  MarketingFooterCta: () => <div data-testid='marketing-footer-cta' />,
}));

import ChangelogPage, { metadata } from './page';

describe('public changelog page', () => {
  beforeEach(() => {
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
  it.each(['empty', 'undated'] as const)(
    'reports %s publication without inventing a date or update',
    async kind => {
      currentSnapshot = {
        ...SNAPSHOT,
        releases:
          kind === 'empty' ? [] : [{ ...SNAPSHOT.releases[0], date: '' }],
      };
      render(await ChangelogPage());
      expect(screen.getByRole('status')).toHaveTextContent(
        kind === 'empty'
          ? 'No customer updates have been published yet.'
          : 'The latest published update is listed below.'
      );
    }
  );
  it('keeps one customer-facing heading and discloses unpublished source slots', async () => {
    render(await ChangelogPage());

    expect(
      screen.getAllByRole('heading', { level: 1, name: "What's new in Jovie" })
    ).toHaveLength(1);
    expect(screen.getByText('Changelog')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(
      'The latest published update is August 31, 2026.'
    );
    expect(
      screen.getByLabelText('Subscribe To Changelog Updates')
    ).toBeVisible();
    expect(screen.queryByText('Product update')).not.toBeInTheDocument();
  });

  it('uses a descriptive product-update title for search and sharing', () => {
    expect(metadata.title).toBe(
      'Jovie Changelog: Product Updates & New Features'
    );
  });

  it('renders the unique docked hero photo and exactly one footer CTA', async () => {
    render(await ChangelogPage());

    const heroPhoto = screen.getByTestId('changelog-hero-photo');
    expect(heroPhoto).toBeInTheDocument();
    expect(heroPhoto.querySelector('img')?.getAttribute('src')).toContain(
      'changelog-index.webp'
    );
    // Route owns its final CTA (MarketingFooterCta) instead of stacking
    // the generic footer request-access banner on top of it (spec rule 2).
    expect(screen.getAllByTestId('marketing-footer-cta')).toHaveLength(1);
  });
});
