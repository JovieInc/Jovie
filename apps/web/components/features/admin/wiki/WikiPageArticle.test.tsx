import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WikiPageArticle } from './WikiPageArticle';

describe('WikiPageArticle', () => {
  it('renders the compiled truth as an article', async () => {
    const ui = await WikiPageArticle({
      page: {
        slug: 'ops/runbook',
        title: 'Runbook',
        compiled_truth: '# Runbook\n\nRestart the lane worker.',
      },
    });
    const { container } = render(ui);

    expect(container.querySelector('article')).not.toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Runbook' })
    ).toBeInTheDocument();
    expect(screen.getByText('Restart the lane worker.')).toBeInTheDocument();
  });

  it('shows an explicit empty state when the page has no content', async () => {
    const ui = await WikiPageArticle({
      page: { slug: 'ops/empty', title: 'Empty' },
    });
    render(ui);

    expect(
      screen.getByText('This wiki page has no content.')
    ).toBeInTheDocument();
  });
});
