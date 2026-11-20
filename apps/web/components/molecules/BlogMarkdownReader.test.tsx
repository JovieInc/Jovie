import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { BlogMarkdownReader } from './BlogMarkdownReader';

describe('BlogMarkdownReader', () => {
  it('renders the sanitized article html with its structure intact', async () => {
    const { container } = render(
      <BlogMarkdownReader
        className='max-w-2xl'
        html={`
          <p>Intro paragraph.</p>
          <h2>Why speed matters</h2>
          <ul><li>Pick a handle</li><li>Share one link</li></ul>
          <p>Read the <a href="/pricing">pricing guide</a>.</p>
        `}
      />
    );

    expect(container.firstElementChild).toHaveClass('relative', 'max-w-2xl');
    expect(
      screen.getByRole('heading', { level: 2, name: 'Why speed matters' })
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('list')).getAllByRole('listitem')
    ).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'pricing guide' })).toHaveAttribute(
      'href',
      '/pricing'
    );
    await expectNoA11yViolations(container);
  });

  it('renders an empty frame for a document with no body', async () => {
    const { container } = render(<BlogMarkdownReader html='' />);

    const frame = container.firstElementChild?.firstElementChild;
    expect(frame).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('keeps a long article with a table and an Arabic article axe-clean', async () => {
    const { container } = render(
      <div>
        <BlogMarkdownReader
          html={`
            <h2>Step one</h2><p>${'Keep every service in step. '.repeat(20)}</p>
            <table>
              <thead><tr><th>Service</th><th>Status</th></tr></thead>
              <tbody><tr><td>Spotify</td><td>Live</td></tr></tbody>
            </table>
            <pre><code>https://jov.ie/artist/a-very-long-release-slug</code></pre>
          `}
        />
        <div dir='rtl' lang='ar'>
          <BlogMarkdownReader html='<h2>لماذا تهم السرعة</h2><p>نحن نبني أسرع طريقة.</p>' />
        </div>
      </div>
    );

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Service' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'لماذا تهم السرعة' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
