import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DocPrintScope } from './DocPrintScope';

afterEach(() => {
  delete document.documentElement.dataset.docPage;
});

describe('DocPrintScope', () => {
  it('marks the document as a doc page while mounted and renders nothing', async () => {
    const { container, unmount } = render(
      <main>
        <h1>Docs</h1>
        <DocPrintScope />
      </main>
    );

    expect(document.documentElement.dataset.docPage).toBe('true');
    expect(container.querySelector('main')?.children).toHaveLength(1);
    await expectNoA11yViolations(container);

    unmount();
    expect(document.documentElement.dataset.docPage).toBeUndefined();
  });

  it('keeps the flag through a rerender', () => {
    const { rerender } = render(<DocPrintScope />);
    rerender(<DocPrintScope />);
    expect(document.documentElement).toHaveAttribute('data-doc-page', 'true');
  });
});
