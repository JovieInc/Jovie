import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const entries = [
  { id: 'a', title: 'Faster claim', date: '2026-10-20', version: '1.0.0' },
  { id: 'b', title: 'Cleaner inbox', date: '2026-10-10', version: '0.9.0' },
  { id: 'c', title: 'Search chats', date: '2026-10-01', version: '0.8.0' },
  { id: 'd', title: 'Older entry', date: '2026-09-01', version: '0.7.0' },
];

const state = { entries };

vi.mock('@/lib/changelog-source', () => ({
  getChangelogSnapshot: vi.fn(async () => ({ sourceReleases: [] })),
}));
vi.mock('@/lib/customer-changelog', () => ({
  projectCustomerChangelogArchive: vi.fn(() => ({
    entries: state.entries,
    tombstones: [],
  })),
  groupCustomerChangelogByMonth: vi.fn((list: typeof entries) => [
    { entries: list },
  ]),
  customerChangelogEntryPath: (entry: { id: string }) =>
    `/changelog/${entry.id}`,
  formatCustomerChangelogDate: (iso: string) => iso,
}));

import { HomepageWhatsNew, HomepageWhatsNewSection } from './HomepageWhatsNew';

afterEach(() => {
  cleanup();
  state.entries = entries;
});

describe('HomepageWhatsNew', () => {
  it('previews the latest three customer changelog entries', async () => {
    render(await HomepageWhatsNew());
    expect(
      screen.getByRole('heading', { name: "What's new" })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByText('Older entry')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'See all updates' })
    ).toHaveAttribute('href', '/changelog');
  });

  it('renders nothing when no entry is published', async () => {
    state.entries = [];
    const { container } = render(await HomepageWhatsNew());
    expect(container).toBeEmptyDOMElement();
  });
});

describe('HomepageWhatsNewSection', () => {
  it('declares itself as the product-gallery release rail', () => {
    render(<HomepageWhatsNewSection entries={entries.slice(0, 3) as never} />);
    const section = screen.getByTestId('marketing-section-product-gallery');
    expect(section).toHaveAttribute('data-marketing-variant', 'release-rail');
    expect(section).toHaveAttribute(
      'data-marketing-owner',
      'apps/web/components/homepage/shell-hero/HomepageWhatsNew.tsx'
    );
  });
});
