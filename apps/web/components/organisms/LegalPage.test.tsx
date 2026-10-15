import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MarketingContentShell } from '@/components/marketing/MarketingContentShell';
import type { LegalDocument } from '@/lib/legal/getLegalDocument';
import { LegalPage } from './LegalPage';

const doc: LegalDocument = {
  slug: 'privacy',
  title: 'Privacy policy',
  lastUpdated: 'October 15, 2026',
  practicalSummary: 'How we handle account data.',
  html: '<h2 id="your-data">Your data</h2><p>You can export your data.</p>',
  toc: [{ id: 'your-data', title: 'Your data', level: 2 }],
};

describe('legal reading surface', () => {
  it('keeps content, contents, print actions and support in the shared prose frame', () => {
    const print = vi.spyOn(globalThis, 'print').mockImplementation(() => {});
    const { container } = render(
      <MarketingContentShell>
        <LegalPage
          doc={doc}
          contactEmail='legal@jov.ie'
          supportDescription='Contact us about this policy.'
        />
      </MarketingContentShell>
    );
    expect(
      container.querySelector('[data-public-content-shell]')
    ).toHaveAttribute('data-public-content-width', 'prose');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Privacy policy' })
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Your data' })).toBeVisible();
    expect(screen.getByText('You can export your data.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'legal@jov.ie' })).toHaveAttribute(
      'href',
      'mailto:legal@jov.ie'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(print).toHaveBeenCalledOnce();
    print.mockRestore();
  });
});
