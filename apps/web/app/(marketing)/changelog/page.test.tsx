import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
  getChangelogSnapshot: async () => SNAPSHOT,
}));

vi.mock('@/components/marketing/changelog/ChangelogSubscribeColumn', () => ({
  ChangelogSubscribeColumn: () => <div data-testid='changelog-subscribe' />,
}));

vi.mock('@/components/site/MarketingFinalCTA', () => ({
  MarketingFinalCTA: () => <div data-testid='marketing-final-cta' />,
}));

import ChangelogPage, { metadata } from './page';

describe('public changelog page', () => {
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
    expect(screen.getAllByText('Product update')).toHaveLength(2);
  });

  it('uses a descriptive product-update title for search and sharing', () => {
    expect(metadata.title).toBe(
      'Jovie Changelog: Product Updates & New Features'
    );
  });
});
