import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BlogMarkdownReader } from './BlogMarkdownReader';

describe('BlogMarkdownReader', () => {
  it('preserves article headings, links and wide table content in the reader', () => {
    const { container } = render(
      <BlogMarkdownReader
        className='reader-context'
        html='<h2 id="details">Release details</h2><p>Read the <a href="/changelog">changelog</a>.</p><table><caption>Formats</caption><tbody><tr><td>Lossless audio</td></tr></tbody></table>'
      />
    );

    expect(
      screen.getByRole('heading', { name: 'Release details' })
    ).toHaveAttribute('id', 'details');
    expect(screen.getByRole('link', { name: 'changelog' })).toHaveAttribute(
      'href',
      '/changelog'
    );
    expect(screen.getByRole('table', { name: 'Formats' })).toHaveTextContent(
      'Lossless audio'
    );
    expect(container.firstElementChild).toHaveClass('reader-context');
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
  });
});
