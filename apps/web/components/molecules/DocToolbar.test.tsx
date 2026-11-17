import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DocToolbar } from './DocToolbar';

describe('DocToolbar', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prints the page', async () => {
    const user = userEvent.setup();
    const print = vi.fn();
    vi.stubGlobal('print', print);
    const { container } = render(<DocToolbar pdfTitle='Terms of Service' />);

    await user.click(screen.getByRole('button', { name: 'Print' }));

    expect(print).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('titles the PDF and restores the document title after printing', async () => {
    const user = userEvent.setup();
    document.title = 'Original';
    let titleWhilePrinting = '';
    vi.stubGlobal('print', () => {
      titleWhilePrinting = document.title;
    });
    render(<DocToolbar pdfTitle='Privacy Policy' />);

    await user.click(screen.getByRole('button', { name: 'Download PDF' }));

    expect(titleWhilePrinting).toMatch(/^Privacy Policy \| /);
    globalThis.dispatchEvent(new Event('afterprint'));
    expect(document.title).toBe('Original');
  });

  it('keeps both actions with an empty title and in RTL', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <DocToolbar pdfTitle='' />
      </div>
    );
    expect(screen.getAllByRole('button')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });
});
