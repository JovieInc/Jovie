import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TocEntry } from '@/types/docs';
import { DocPage } from './DocPage';

const toc: TocEntry[] = [
  { id: 'overview', title: 'Overview', level: 2 },
  { id: 'your-rights', title: 'Your rights', level: 2 },
];

const doc = {
  title: 'Terms of Service',
  lastUpdated: 'September 1, 2026',
  practicalSummary: 'Use Jovie in good faith and keep your account secure.',
  toc,
  html: '<h2 id="overview">Overview</h2><p>Terms of using Jovie.</p><h2 id="your-rights">Your rights</h2><p>You own your content.</p>',
};

describe('DocPage', () => {
  it('renders one H1, the last-updated date and a table of contents', () => {
    render(<DocPage doc={doc} pdfTitle='Jovie Terms of Service' />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Terms of Service' })
    ).toBeVisible();
    expect(
      screen.getByText('Last updated: September 1, 2026')
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('navigation', { name: 'Document navigation' }).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)
    ).toEqual(['Overview', 'Your rights']);
  });

  it('holds the title and body to one readable column beside the contents', () => {
    const { container } = render(
      <DocPage doc={doc} pdfTitle='Jovie Terms of Service' />
    );
    const header = container.querySelector('[data-doc-header]');
    const article = container.querySelector('article');
    const sidebar = container.querySelector('[data-doc-sidebar]');

    // Title and body share the second track and the ~65ch measure, so the
    // H1 and every paragraph start on the same edge.
    for (const column of [header, article]) {
      expect(column).toHaveClass('max-w-prose', 'lg:col-start-2');
    }
    expect(header).toHaveClass('lg:row-start-1');
    expect(article).toHaveClass('lg:row-start-2');
    expect(sidebar).toHaveClass('lg:col-start-1', 'lg:row-span-2', 'lg:sticky');
    expect(header?.querySelector('h1')).not.toBeNull();
  });
});
