import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChangelogRelease } from '@/lib/changelog-parser';

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
}));

const RELEASES: readonly ChangelogRelease[] = [
  {
    version: '26.9.0',
    date: '2026-09-09',
    summary: 'Presence workspace ships **public visibility** reporting.',
    sections: {
      featured: [],
      added: ['**Visibility report:** weekly score with `source` citations.'],
      changed: ['Profile readiness checklist ordering.'],
      fixed: [],
      removed: [],
    },
  },
  {
    version: '26.8.0',
    date: '2026-08-09',
    summary: 'Chat shell refinements.',
    sections: {
      featured: [],
      added: [],
      changed: ['Composer keeps drafts per thread.'],
      fixed: ['Streaming replies no longer jump the scroll position.'],
      removed: ['The legacy sidebar flyout.'],
    },
  },
  {
    version: '26.7.0',
    date: '2026-07-21',
    summary: 'First public release in this set.',
    sections: {
      featured: [],
      added: ['**Release workspace:** keeps status and links together.'],
      changed: [],
      fixed: [],
      removed: [],
    },
  },
];

vi.mock('@/lib/changelog-source', () => ({
  getChangelogReleases: async () => RELEASES,
}));

import ChangelogReleasePage, {
  generateMetadata,
  generateStaticParams,
} from './page';

async function renderVersion(version: string) {
  const jsx = await ChangelogReleasePage({
    params: Promise.resolve({ version }),
  });
  return render(jsx);
}

describe('ChangelogReleasePage', () => {
  it('renders the release header, body sections, resources, and navigation', async () => {
    await renderVersion('26.9.0');

    expect(
      screen.getByRole('heading', { level: 1, name: 'v26.9.0' })
    ).toBeVisible();
    expect(screen.getByText('Current')).toBeVisible();
    expect(screen.getByText('No breaking changes')).toBeVisible();
    expect(screen.getByRole('link', { name: '/changelog' })).toHaveAttribute(
      'href',
      '/changelog'
    );
    expect(screen.getByText('/v26.9.0')).toBeVisible();
    expect(screen.getByText('Shipped 9 Sept 2026')).toBeVisible();
    expect(screen.getByText('2 updates')).toBeVisible();
    expect(
      screen.getByText('Presence workspace ships public visibility reporting.')
    ).toBeVisible();

    expect(screen.getByText("What's new")).toBeVisible();
    expect(screen.getByText('Visibility report')).toBeVisible();
    expect(screen.getByText('source', { selector: 'code' })).toBeVisible();
    expect(screen.getAllByText('Improved')).toHaveLength(2);

    expect(
      screen.getByRole('heading', { name: 'Resources for this release' })
    ).toBeVisible();
    expect(screen.getByRole('link', { name: /RSS Feed/ })).toHaveAttribute(
      'href',
      '/changelog/feed.xml'
    );
    expect(screen.getByRole('link', { name: /JSON Feed/ })).toHaveAttribute(
      'href',
      '/changelog/feed.json'
    );
    expect(screen.getByRole('link', { name: /Developers/ })).toHaveAttribute(
      'href',
      '/developers'
    );
    expect(
      screen.getByRole('link', { name: /OpenAPI Contract/ })
    ).toHaveAttribute('href', '/openapi.json');

    expect(screen.getByText('Previous release')).toBeVisible();
    expect(screen.getByRole('link', { name: 'v26.8.0' })).toHaveAttribute(
      'href',
      '/changelog/26.8.0'
    );
    expect(screen.getByText('You are on the latest')).toBeVisible();
    expect(screen.getByRole('link', { name: /All releases/ })).toHaveAttribute(
      'href',
      '/changelog'
    );
  });

  it('drops the latest/breaking pills and links both neighbors on a middle release', async () => {
    await renderVersion('26.8.0');

    expect(screen.queryByText('Current')).not.toBeInTheDocument();
    expect(screen.queryByText('No breaking changes')).not.toBeInTheDocument();
    expect(screen.getAllByText('Removed')).toHaveLength(2);
    expect(screen.getByText('The legacy sidebar flyout.')).toBeVisible();
    expect(screen.getByText('Next release')).toBeVisible();
    expect(screen.getByRole('link', { name: 'v26.9.0' })).toHaveAttribute(
      'href',
      '/changelog/26.9.0'
    );
    expect(screen.getByRole('link', { name: 'v26.7.0' })).toHaveAttribute(
      'href',
      '/changelog/26.7.0'
    );
    expect(screen.queryByText('You are on the latest')).not.toBeInTheDocument();
  });

  it('marks the earliest release without inventing an older link', async () => {
    await renderVersion('26.7.0');

    expect(
      screen.getByText('This is the earliest public release.')
    ).toBeVisible();
    expect(screen.getByText('1 update')).toBeVisible();
  });

  it('calls notFound for unknown versions', async () => {
    await expect(renderVersion('0.0.0')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mocks.notFound).toHaveBeenCalled();
  });

  it('preserves the metadata and static-params contract', async () => {
    const params = await generateStaticParams();
    expect(params).toEqual([
      { version: '26.9.0' },
      { version: '26.8.0' },
      { version: '26.7.0' },
    ]);

    const metadata = await generateMetadata({
      params: Promise.resolve({ version: '26.8.0' }),
    });
    expect(metadata.title).toBe('Jovie v26.8.0');
    expect(metadata.description).toBe('Chat shell refinements.');
    expect(metadata.alternates).toEqual({
      canonical: 'https://jov.ie/changelog/26.8.0',
    });
    expect(metadata.openGraph).toMatchObject({
      type: 'article',
      publishedTime: '2026-08-09T00:00:00Z',
    });

    await expect(
      generateMetadata({ params: Promise.resolve({ version: '0.0.0' }) })
    ).resolves.toEqual({});
  });
});
