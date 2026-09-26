import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CompanyActivityFeedView } from '@/components/features/admin/hud/CompanyActivityFeed';
import type { CompanyActivityRow } from '@/lib/hud/company-activity';

function row(overrides: Partial<CompanyActivityRow> = {}): CompanyActivityRow {
  return {
    id: 'linear:JOV-5544',
    source: 'linear',
    actor: 'symphony',
    linearIdentifier: 'JOV-5544',
    title: 'Cache Symphony workspaces',
    state: 'in-progress',
    href: 'https://linear.app/jovie/issue/JOV-5544/x',
    receipt: null,
    observedAt: '2026-09-21T00:00:00.000Z',
    freshness: 'fresh',
    ...overrides,
  };
}

describe('CompanyActivityFeedView', () => {
  it('renders each row with exact state, source, and provenance', () => {
    render(
      <CompanyActivityFeedView
        rows={[
          row(),
          row({
            id: 'receipt:abc123',
            source: 'symphony-runtime',
            linearIdentifier: 'JOV-5298',
            title: 'Verified ship receipt',
            state: 'deployed',
            href: null,
            receipt: 'aaaaaaa',
          }),
          row({
            id: 'digest:x',
            source: 'public-digest',
            actor: 'curated',
            linearIdentifier: null,
            title: 'Smarter release digests',
            state: 'publicly-available',
            href: '/changelog/1.2.3',
          }),
        ]}
        syncLabel='Fresh'
        syncTone='good'
      />
    );

    const feed = screen.getByTestId('ovie-company-activity-feed');
    expect(feed).toHaveTextContent('In Progress');
    expect(feed).toHaveTextContent('Deployed');
    expect(feed).toHaveTextContent('Public');
    expect(feed).toHaveTextContent('JOV-5544');
    expect(feed).toHaveTextContent('receipt aaaaaaa');
    expect(
      screen.getByRole('link', { name: /Cache Symphony workspaces/ })
    ).toHaveAttribute('href', 'https://linear.app/jovie/issue/JOV-5544/x');
    expect(
      screen.getByRole('link', { name: /Smarter release digests/ })
    ).toHaveAttribute('href', '/changelog/1.2.3');
  });

  it('shows an honest empty state when nothing is observed', () => {
    render(
      <CompanyActivityFeedView
        rows={[]}
        syncLabel='Unknown'
        syncTone='neutral'
      />
    );
    expect(screen.getByTestId('ovie-company-activity-feed')).toHaveTextContent(
      'No company activity observed.'
    );
  });
});
