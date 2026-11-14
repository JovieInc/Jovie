import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LegalDocument } from '@/lib/legal/getLegalDocument';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { LegalPage } from './LegalPage';

// jsdom applies no Tailwind CSS, so both responsive copies of the contents nav
// would be exposed at once. Load the one breakpoint rule a desktop viewport
// applies (the mobile copy is lg:hidden), as the browser does at >= lg.
let desktopBreakpoint: HTMLStyleElement | null = null;
beforeEach(() => {
  desktopBreakpoint = document.createElement('style');
  desktopBreakpoint.textContent = '.lg\\:hidden { display: none; }';
  document.head.append(desktopBreakpoint);
});
afterEach(() => {
  desktopBreakpoint?.remove();
});

const doc = {
  slug: 'privacy',
  title: 'Privacy Policy',
  lastUpdated: 'September 1, 2026',
  practicalSummary: 'You own your data.',
  toc: [{ id: 'overview', title: 'Overview', level: 2 }],
  html: '<h2 id="overview">Overview</h2><p>How we handle your data.</p>',
} as unknown as LegalDocument;

describe('LegalPage certificate', () => {
  it('renders the document and the support block axe-clean', async () => {
    const { container } = render(
      <LegalPage
        doc={doc}
        contactEmail='privacy@jov.ie'
        supportDescription='Questions about this policy?'
      />
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })
    ).toBeVisible();
    expect(screen.getByText('Questions about this policy?')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'privacy@jov.ie' })
    ).toHaveAttribute('href', 'mailto:privacy@jov.ie');
    await expectNoA11yViolations(container);
  });

  it('prints with the document title as the PDF title', async () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);
    const user = userEvent.setup();
    render(
      <LegalPage
        doc={doc}
        contactEmail='privacy@jov.ie'
        supportDescription='Questions?'
      />
    );

    await user.click(screen.getByRole('button', { name: 'Download PDF' }));

    expect(print).toHaveBeenCalledTimes(1);
    expect(document.title).toContain('Privacy Policy');
    globalThis.dispatchEvent(new Event('afterprint'));
    vi.unstubAllGlobals();
  });

  it('renders long support copy axe-clean', async () => {
    const description = 'A long support description. '.repeat(10).trim();
    const { container } = render(
      <LegalPage
        doc={doc}
        contactEmail='privacy@jov.ie'
        supportDescription={description}
      />
    );

    expect(screen.getByText(description)).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean inside a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <LegalPage
          doc={{ ...doc, title: 'سياسة الخصوصية' } as LegalDocument}
          contactEmail='privacy@jov.ie'
          supportDescription='هل لديك أسئلة؟'
        />
      </div>
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'سياسة الخصوصية' })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
