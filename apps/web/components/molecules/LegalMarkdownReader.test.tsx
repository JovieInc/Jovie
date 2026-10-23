import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LegalMarkdownReader } from './LegalMarkdownReader';

describe('LegalMarkdownReader', () => {
  it('renders legal prose while keeping every scroll region keyboard reachable', () => {
    render(
      <LegalMarkdownReader html='<h2>Your data</h2><p>You can export your data.</p><table><caption>Retention</caption><tbody><tr><td>30 days</td></tr></tbody></table><pre><code>export data</code></pre>' />
    );

    expect(screen.getByRole('heading', { name: 'Your data' })).toBeVisible();
    expect(screen.getByText('You can export your data.')).toBeVisible();
    const table = screen.getByRole('table', { name: 'Retention' });
    expect(table).toHaveAttribute('tabindex', '0');
    table.focus();
    expect(table).toHaveFocus();
    const code = screen.getByText('export data').closest('pre');
    expect(code).toHaveAttribute('tabindex', '0');
    code?.focus();
    expect(code).toHaveFocus();
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });
});
