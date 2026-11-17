import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { TocEntry } from '@/types/docs';
import { DocPage } from './DocPage';

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

describe('DocPage certificate', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the document axe-clean', async () => {
    const { container } = render(
      <DocPage doc={doc} pdfTitle='Jovie Terms of Service' />
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Terms of Service' })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('prints from the toolbar and titles the PDF for download', async () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);
    const user = userEvent.setup();
    document.title = 'Terms';
    render(<DocPage doc={doc} pdfTitle='Jovie Terms of Service' />);

    await user.click(screen.getByRole('button', { name: 'Print' }));
    expect(print).toHaveBeenCalledTimes(1);
    expect(document.title).toBe('Terms');

    await user.click(screen.getByRole('button', { name: 'Download PDF' }));
    expect(print).toHaveBeenCalledTimes(2);
    expect(document.title).toContain('Jovie Terms of Service');

    globalThis.dispatchEvent(new Event('afterprint'));
    expect(document.title).toBe('Terms');
    vi.unstubAllGlobals();
  });

  it('renders a document with no headings axe-clean', async () => {
    const { container } = render(
      <DocPage
        doc={{ ...doc, toc: [], html: '<p>Only one paragraph.</p>' }}
        pdfTitle='Notice'
      />
    );

    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0);
    expect(screen.getByText('Only one paragraph.')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('renders a long document and a caller aside axe-clean', async () => {
    const longToc = Array.from({ length: 12 }, (_, index) => ({
      id: `s-${index + 1}`,
      title: `Section ${index + 1} with a long descriptive heading`,
      level: 2,
    }));
    const { container } = render(
      <DocPage
        doc={{
          ...doc,
          toc: longToc,
          html: longToc
            .map(e => `<h2 id="${e.id}">${e.title}</h2><p>Body.</p>`)
            .join(''),
        }}
        pdfTitle='Long'
        aside={<p>Questions? Email privacy@jov.ie</p>}
      />
    );

    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(12);
    expect(screen.getByText('Questions? Email privacy@jov.ie')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean inside a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <DocPage doc={{ ...doc, title: 'شروط الخدمة' }} pdfTitle='Terms' />
      </div>
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'شروط الخدمة' })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
