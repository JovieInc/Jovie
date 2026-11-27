import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { WikiPageArticle } from './WikiPageArticle';

describe('WikiPageArticle certificate', () => {
  it('keeps a long compiled page axe-clean', async () => {
    const body = Array.from(
      { length: 8 },
      (_, i) => `## Step ${i + 1}\n\nRestart the lane worker.`
    ).join('\n\n');
    const ui = await WikiPageArticle({
      page: { slug: 'ops/long', title: 'Long', compiled_truth: body },
    });
    const { container } = render(ui);
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(8);
    await expectNoA11yViolations(container);
  });

  it('keeps the empty page message axe-clean', async () => {
    const ui = await WikiPageArticle({
      page: { slug: 'ops/empty', title: 'Empty' },
    });
    const { container } = render(ui);
    expect(
      screen.getByText('This wiki page has no content.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
